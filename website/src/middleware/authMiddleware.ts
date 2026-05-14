import type { APIContext } from 'astro';
import { defineMiddleware } from 'astro/middleware';
import { serialize, type SerializeOptions } from 'cookie';
import jsonwebtoken from 'jsonwebtoken';
import JwksRsa from 'jwks-rsa';
import { err, ok, ResultAsync } from 'neverthrow';
import { type BaseClient, type TokenSet } from 'openid-client';

import { getConfiguredOrganisms, getRuntimeConfig, getWebsiteConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { getAutheliaForwardedHeaders, OidcClientManager } from '../utils/OidcClientManager.ts';
import { decodeState, getAuthUrl } from '../utils/getAuthUrl.ts';
import { shouldMiddlewareEnforceLogin } from '../utils/shouldMiddlewareEnforceLogin.ts';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const OIDC_ACCESS_TOKEN_COOKIE = 'oidc_access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

enum TokenVerificationError {
    EXPIRED,
    REQUEST_ERROR,
    INVALID_TOKEN,
}

const logger = getInstanceLogger('LoginMiddleware');

async function getValidTokenAndUserInfoFromCookie(context: APIContext, client: BaseClient) {
    logger.debug(`Trying to get token and user info from cookie`);
    const token = await getTokenFromCookie(context, client);
    if (token !== undefined) {
        const userInfo = await getUserInfo(token, client);

        if (userInfo.isErr()) {
            logger.debug(`Cookie token found but could not get user info`);
            deleteCookie(context);
            return undefined;
        }
        logger.debug(`Token and valid user info found in cookie`);
        return {
            token,
            userInfo,
        };
    }
    return undefined;
}

async function getValidTokenAndUserInfoFromParams(context: APIContext, client: BaseClient) {
    logger.debug(`Trying to get token and user info from params`);
    const token = await getTokenFromParams(context, client);
    if (token !== undefined) {
        const userInfo = await getUserInfo(token, client);

        if (userInfo.isErr()) {
            logger.debug(`Token found in params but could not get user info`);
            return undefined;
        }
        logger.debug(`Token and valid user info found in params`);
        return {
            token,
            userInfo,
        };
    }
    return undefined;
}

export const authMiddleware = defineMiddleware(async (context, next) => {
    let token: TokenCookie | undefined;
    let userInfo;

    if (getWebsiteConfig().readOnlyMode) {
        const enforceLogin = shouldMiddlewareEnforceLogin(
            context.url.pathname,
            getConfiguredOrganisms().map((it) => it.key),
        );
        if (enforceLogin) {
            return context.redirect('/503?service=readonly');
        }
        deleteCookie(context);
        context.locals.session = { isLoggedIn: false };
        return next();
    }

    const client = await OidcClientManager.getClient();
    if (client !== undefined) {
        // Only run this when OIDC client up
        const cookieResult = await getValidTokenAndUserInfoFromCookie(context, client);
        token = cookieResult?.token;
        userInfo = cookieResult?.userInfo;
        if (token === undefined) {
            const paramResult = await getValidTokenAndUserInfoFromParams(context, client);
            token = paramResult?.token;
            userInfo = paramResult?.userInfo;

            if (token !== undefined) {
                logger.debug(`Token found in params, setting cookie`);
                const cookieHeaders = setCookie(context, token);
                // OIDC roundtrip lands on /auth/callback; the original
                // destination is encoded in `state`. Fall back to the same
                // URL with code/state stripped (covers any legacy flow).
                const decoded = decodeState(context.url.searchParams.get('state') ?? undefined);
                const returnTo = decoded?.r ?? removeTokenCodeFromSearchParams(context.url);
                return createRedirectWithModifiableHeaders(returnTo, cookieHeaders);
            }
        }
    } else {
        logger.warn(`OIDC client not available, pretending user logged out`);
    }

    const enforceLogin = shouldMiddlewareEnforceLogin(
        context.url.pathname,
        getConfiguredOrganisms().map((it) => it.key),
    );

    if (enforceLogin && (userInfo === undefined || userInfo.isErr())) {
        if (client === undefined) {
            logger.error(`OIDC client not available, cannot redirect to auth`);
            return context.redirect('/503?service=Authentication');
        }
        return redirectToAuth(context);
    }

    if (token === undefined || userInfo === undefined) {
        context.locals.session = {
            isLoggedIn: false,
        };

        return next();
    }

    if (userInfo.isErr()) {
        context.locals.session = {
            isLoggedIn: false,
        };
        logger.debug(`Error getting user info: ${userInfo.error}`);
        logger.debug(`Clearing auth cookies.`);
        deleteCookie(context);
        return next();
    }

    context.locals.session = {
        isLoggedIn: true,
        user: {
            name: userInfo.value.name ?? 'Name not set',
            username: userInfo.value.preferred_username,
            email: userInfo.value.email,
            emailVerified: userInfo.value.email_verified,
        },
        token,
    };

    return next();
});

async function getTokenFromCookie(context: APIContext, client: BaseClient) {
    const accessToken = context.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    const oidcAccessToken = context.cookies.get(OIDC_ACCESS_TOKEN_COOKIE)?.value;
    const refreshToken = context.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

    if (accessToken === undefined || refreshToken === undefined) {
        return undefined;
    }
    const tokenCookie = {
        accessToken,
        oidcAccessToken,
        refreshToken,
    };

    const verifiedTokenResult = await verifyToken(accessToken, client);
    if (verifiedTokenResult.isErr() && verifiedTokenResult.error.type === TokenVerificationError.EXPIRED) {
        logger.debug(`Token expired, trying to refresh`);
        return refreshTokenViaOidc(tokenCookie, client);
    }
    if (verifiedTokenResult.isErr()) {
        logger.info(`Error verifying token: ${verifiedTokenResult.error.message}`);
        return undefined;
    }
    logger.debug(`Token successfully verified, returning it`);

    return tokenCookie;
}

async function verifyToken(accessToken: string, client: BaseClient) {
    logger.debug(`Verifying token`);
    const tokenHeader = jsonwebtoken.decode(accessToken, { complete: true })?.header;
    const kid = tokenHeader?.kid;
    if (kid === undefined) {
        logger.debug(`Access token is opaque; deferring validation to userinfo`);
        return ok(undefined);
    }

    if (client.issuer.metadata.jwks_uri === undefined) {
        return err({
            type: TokenVerificationError.REQUEST_ERROR,
            message: `OIDC client does not contain jwks_uri: ${JSON.stringify(client.issuer.metadata.jwks_uri)}`,
        });
    }

    const jwksClient = new JwksRsa.JwksClient({
        jwksUri: client.issuer.metadata.jwks_uri,
        requestHeaders: getAutheliaForwardedHeaders(),
    });

    try {
        const signingKey = await jwksClient.getSigningKey(kid);
        return ok(jsonwebtoken.verify(accessToken, signingKey.getPublicKey()));
    } catch (error) {
        logger.debug(`Error verifying token: ${error}`);
        switch ((error as Error).name) {
            case 'TokenExpiredError':
                return err({
                    type: TokenVerificationError.EXPIRED,
                    message: (error as Error).message,
                });

            case 'JsonWebTokenError':
                return err({
                    type: TokenVerificationError.INVALID_TOKEN,
                    message: (error as Error).message,
                });
            default:
                return err({
                    type: TokenVerificationError.REQUEST_ERROR,
                    message: (error as Error).message,
                });
        }
    }
}

async function getUserInfo(token: TokenCookie, client: BaseClient) {
    return ResultAsync.fromPromise(client.userinfo(token.oidcAccessToken ?? token.accessToken), (error) => {
        logger.debug(`Error getting user info: ${error}`);
        return error;
    });
}

async function getTokenFromParams(context: APIContext, client: BaseClient): Promise<TokenCookie | undefined> {
    const params = client.callbackParams(context.url.toString());
    logger.debug(`OIDC callback params: ${JSON.stringify(params)}`);
    if (params.code !== undefined) {
        // The redirect_uri sent on the token exchange must match the one from
        // the original authorize request exactly. Our authorize call uses the
        // bare /auth/callback URL (no query string), so reconstruct that here
        // regardless of which extra params the IDP appended on its way back.
        const callbackUrl = new URL(context.url.toString());
        callbackUrl.search = '';
        callbackUrl.hash = '';
        const redirectUri = callbackUrl.toString();
        logger.debug(`OIDC callback redirect uri: ${redirectUri}`);
        const decoded = decodeState(params.state);
        if (!decoded) {
            logger.info('OIDC callback received without a recognisable state payload');
            return undefined;
        }
        const tokenSet = await client
            .callback(redirectUri, params, {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                response_type: 'code',
                state: params.state,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                code_verifier: decoded.v,
            })
            .catch((error: unknown) => {
                logger.info(`OIDC callback error: ${error}`);
                return undefined;
            });
        return extractTokenCookieFromTokenSet(tokenSet);
    }
    return undefined;
}

function getTokenCookieOptions(): SerializeOptions {
    const runtimeConfig = getRuntimeConfig();
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: !runtimeConfig.insecureCookies,
        path: '/',
    };
}

function setCookie(context: APIContext, token: TokenCookie): string[] {
    const cookieOptions = getTokenCookieOptions();
    logger.debug(`Setting token cookie`);
    context.cookies.set(ACCESS_TOKEN_COOKIE, token.accessToken, cookieOptions);
    if (token.oidcAccessToken !== undefined) {
        context.cookies.set(OIDC_ACCESS_TOKEN_COOKIE, token.oidcAccessToken, cookieOptions);
    }
    context.cookies.set(REFRESH_TOKEN_COOKIE, token.refreshToken, cookieOptions);
    const cookieHeaders = [
        serialize(ACCESS_TOKEN_COOKIE, token.accessToken, cookieOptions),
        token.oidcAccessToken === undefined
            ? undefined
            : serialize(OIDC_ACCESS_TOKEN_COOKIE, token.oidcAccessToken, cookieOptions),
        serialize(REFRESH_TOKEN_COOKIE, token.refreshToken, cookieOptions),
    ];
    return cookieHeaders.filter((it): it is string => it !== undefined);
}

function deleteCookie(context: APIContext): string[] {
    logger.debug(`Deleting token cookie`);
    try {
        context.cookies.delete(ACCESS_TOKEN_COOKIE, { path: '/' });
        context.cookies.delete(OIDC_ACCESS_TOKEN_COOKIE, { path: '/' });
        context.cookies.delete(REFRESH_TOKEN_COOKIE, { path: '/' });
    } catch {
        logger.info(`Error deleting cookie`);
    }
    const deleteOptions: SerializeOptions = { path: '/', maxAge: 0 };
    return [
        serialize(ACCESS_TOKEN_COOKIE, '', deleteOptions),
        serialize(OIDC_ACCESS_TOKEN_COOKIE, '', deleteOptions),
        serialize(REFRESH_TOKEN_COOKIE, '', deleteOptions),
    ];
}

// https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Basic_concepts#guard
// URL must be absolute, otherwise throws TypeError
const createRedirectWithModifiableHeaders = (url: string, cookieHeaders: string[] = []) => {
    logger.debug(`Redirecting to ${url}`);
    const redirect = Response.redirect(url);
    const response = new Response(null, { status: redirect.status, headers: redirect.headers });
    for (const cookie of cookieHeaders) {
        response.headers.append('set-cookie', cookie);
    }
    return response;
};

const redirectToAuth = async (context: APIContext) => {
    const currentUrl = context.url;
    const redirectUrl = removeTokenCodeFromSearchParams(currentUrl);

    logger.debug(`Redirecting to auth with redirect url: ${redirectUrl}`);
    const authUrl = await getAuthUrl(redirectUrl);

    const cookieHeaders = deleteCookie(context);
    return createRedirectWithModifiableHeaders(authUrl, cookieHeaders);
};

function removeTokenCodeFromSearchParams(url: URL): string {
    const newUrl = new URL(url.toString());

    newUrl.searchParams.delete('code');
    newUrl.searchParams.delete('session_state');
    newUrl.searchParams.delete('iss');

    return newUrl.toString();
}

async function refreshTokenViaOidc(token: TokenCookie, client: BaseClient): Promise<TokenCookie | undefined> {
    const refreshedTokenSet = await client.refresh(token.refreshToken).catch(() => {
        logger.info(`Failed to refresh token`);
        return undefined;
    });
    return extractTokenCookieFromTokenSet(refreshedTokenSet);
}

function extractTokenCookieFromTokenSet(tokenSet: TokenSet | undefined): TokenCookie | undefined {
    // Authelia access tokens are opaque. Loculus backend is a JWT resource
    // server, so use the OIDC ID token for backend bearer auth and keep the
    // opaque access token only for provider userinfo calls.
    const accessToken = tokenSet?.id_token ?? tokenSet?.access_token;
    const oidcAccessToken = tokenSet?.access_token;
    const refreshToken = tokenSet?.refresh_token;

    if (tokenSet === undefined || accessToken === undefined || refreshToken === undefined) {
        logger.error(`Error extracting token cookie from token set`);
        return undefined;
    }

    return {
        accessToken,
        oidcAccessToken,
        refreshToken,
    };
}
