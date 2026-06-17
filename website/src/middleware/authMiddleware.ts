import type { APIContext } from 'astro';
import { defineMiddleware } from 'astro/middleware';
import { serialize, type SerializeOptions } from 'cookie';
import jsonwebtoken from 'jsonwebtoken';
import JwksRsa from 'jwks-rsa';
import { err, ok, ResultAsync } from 'neverthrow';
import { type BaseClient, type TokenSet } from 'openid-client';

import { createSessionId, deleteSession, getSessionTokens, putSessionTokens } from './sessionStore.ts';
import { getConfiguredOrganisms, getRuntimeConfig, getWebsiteConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { getAutheliaForwardedHeaders, OidcClientManager } from '../utils/OidcClientManager.ts';
import { decodeState, getAuthUrl } from '../utils/getAuthUrl.ts';
import { shouldMiddlewareEnforceLogin } from '../utils/shouldMiddlewareEnforceLogin.ts';

// Opaque browser-session cookie. It holds only a random session id; the actual
// OIDC tokens live server-side in the session store and never reach the client.
export const SESSION_COOKIE = 'loculus_session';

// Legacy cookies from the previous JWT-in-cookie scheme. We no longer set these,
// but we clear them so users carrying them from a prior deploy don't keep stale
// tokens in their browser.
export const ACCESS_TOKEN_COOKIE = 'access_token';
export const OIDC_ACCESS_TOKEN_COOKIE = 'oidc_access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

const LEGACY_TOKEN_COOKIES = [ACCESS_TOKEN_COOKIE, OIDC_ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE];

enum TokenVerificationError {
    EXPIRED,
    REQUEST_ERROR,
    INVALID_TOKEN,
}

const logger = getInstanceLogger('LoginMiddleware');

async function getValidTokenAndUserInfoFromSession(context: APIContext, client: BaseClient) {
    logger.debug(`Trying to get token and user info from session`);
    const token = await getTokenFromSession(context, client);
    if (token !== undefined) {
        const userInfo = await getUserInfo(token, client);

        if (userInfo.isErr()) {
            logger.debug(`Session token found but could not get user info`);
            clearSession(context);
            return undefined;
        }
        logger.debug(`Token and valid user info found in session`);
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
        clearSession(context);
        context.locals.session = { isLoggedIn: false };
        return next();
    }

    const client = await OidcClientManager.getClient();
    if (client !== undefined) {
        // Only run this when OIDC client up
        const sessionResult = await getValidTokenAndUserInfoFromSession(context, client);
        token = sessionResult?.token;
        userInfo = sessionResult?.userInfo;
        if (token === undefined) {
            const paramResult = await getValidTokenAndUserInfoFromParams(context, client);
            token = paramResult?.token;
            userInfo = paramResult?.userInfo;

            if (token !== undefined) {
                logger.debug(`Token found in params, establishing session`);
                const cookieHeaders = establishSession(context, token);
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
        logger.debug(`Clearing session.`);
        clearSession(context);
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

async function getTokenFromSession(context: APIContext, client: BaseClient) {
    const sessionId = context.cookies.get(SESSION_COOKIE)?.value;
    const tokenCookie = getSessionTokens(sessionId);

    if (tokenCookie === undefined) {
        return undefined;
    }

    const verifiedTokenResult = await verifyToken(tokenCookie.accessToken, client);
    if (verifiedTokenResult.isErr() && verifiedTokenResult.error.type === TokenVerificationError.EXPIRED) {
        logger.debug(`Token expired, trying to refresh`);
        const refreshed = await refreshTokenViaOidc(tokenCookie, client);
        if (refreshed !== undefined && sessionId !== undefined) {
            // Persist the rotated tokens server-side; the opaque cookie is unchanged.
            putSessionTokens(sessionId, refreshed);
        }
        return refreshed;
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

function getSessionCookieOptions(): SerializeOptions {
    const runtimeConfig = getRuntimeConfig();
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: !runtimeConfig.insecureCookies,
        path: '/',
    };
}

/**
 * Creates a server-side session for the freshly obtained tokens and returns the
 * Set-Cookie headers: the opaque session id plus deletions for any legacy
 * JWT-in-cookie values the browser might still be carrying.
 */
function establishSession(context: APIContext, token: TokenCookie): string[] {
    const sessionId = createSessionId();
    putSessionTokens(sessionId, token);

    const cookieOptions = getSessionCookieOptions();
    logger.debug(`Setting session cookie`);
    context.cookies.set(SESSION_COOKIE, sessionId, cookieOptions);

    return [serialize(SESSION_COOKIE, sessionId, cookieOptions), ...clearLegacyCookieHeaders(context)];
}

/**
 * Drops the server-side session and clears the opaque session cookie (and any
 * legacy token cookies). Returns the corresponding Set-Cookie headers for
 * callers that build their own Response.
 */
function clearSession(context: APIContext): string[] {
    logger.debug(`Clearing session`);
    deleteSession(context.cookies.get(SESSION_COOKIE)?.value);

    const deleteOptions: SerializeOptions = { path: '/', maxAge: 0 };
    try {
        context.cookies.delete(SESSION_COOKIE, { path: '/' });
    } catch {
        logger.info(`Error deleting session cookie`);
    }
    return [serialize(SESSION_COOKIE, '', deleteOptions), ...clearLegacyCookieHeaders(context)];
}

function clearLegacyCookieHeaders(context: APIContext): string[] {
    const deleteOptions: SerializeOptions = { path: '/', maxAge: 0 };
    return LEGACY_TOKEN_COOKIES.map((name) => {
        try {
            context.cookies.delete(name, { path: '/' });
        } catch {
            logger.info(`Error deleting legacy cookie ${name}`);
        }
        return serialize(name, '', deleteOptions);
    });
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

    const cookieHeaders = clearSession(context);
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
