import type { APIContext } from 'astro';
import { defineMiddleware } from 'astro/middleware';
import jsonwebtoken, { type JwtPayload } from 'jsonwebtoken';
import JwksRsa from 'jwks-rsa';
import { err, ok } from 'neverthrow';
import { type BaseClient, type TokenSet } from 'openid-client';

import { getConfiguredOrganisms, getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { KeycloakClientManager } from '../utils/KeycloakClientManager.ts';
import { getAuthUrl } from '../utils/getAuthUrl.ts';
import { shouldMiddlewareEnforceLogin } from '../utils/shouldMiddlewareEnforceLogin.ts';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

enum TokenVerificationError {
    EXPIRED,
    REQUEST_ERROR,
    INVALID_TOKEN,
}

const logger = getInstanceLogger('LoginMiddleware');

async function getValidTokenAndVerifiedTokenFromCookie(context: APIContext, client: BaseClient) {
    logger.debug(`Trying to get token and verified token from cookie`);
    const token = await getTokenFromCookie(context, client);
    if (token !== undefined) {
        const verifiedToken = await verifyToken(token.accessToken, client);

        if (verifiedToken.isErr()) {
            logger.debug(`Cookie token found but could not be verified`);
            deleteCookie(context);
            return undefined;
        }
        logger.debug(`Token and verified token found in cookie`);
        return {
            token,
            verifiedToken,
        };
    }
    return undefined;
}

async function getValidTokenAndVerifiedTokenFromParams(context: APIContext, client: BaseClient) {
    logger.debug(`Trying to get token and verified token from params`);
    const token = await getTokenFromParams(context, client);
    if (token !== undefined) {
        const verifiedToken = await verifyToken(token.accessToken, client);

        if (verifiedToken.isErr()) {
            logger.debug(`Token found in params but could not be verified`);
            return undefined;
        }
        logger.debug(`Token and verified token found in params`);
        return {
            token,
            verifiedToken,
        };
    }
    return undefined;
}

export const authMiddleware = defineMiddleware(async (context, next) => {
    let token: TokenCookie | undefined;
    let verifiedToken;

    const client = await KeycloakClientManager.getClient();
    if (client !== undefined) {
        // Only run this when keycloak up
        const cookieResult = await getValidTokenAndVerifiedTokenFromCookie(context, client);
        token = cookieResult?.token;
        verifiedToken = cookieResult?.verifiedToken;
        if (token === undefined) {
            const paramResult = await getValidTokenAndVerifiedTokenFromParams(context, client);
            token = paramResult?.token;
            verifiedToken = paramResult?.verifiedToken;

            if (token !== undefined) {
                logger.debug(`Token found in params, setting cookie`);
                setCookie(context, token);
                return createRedirectWithModifiableHeaders(removeTokenCodeFromSearchParams(context.url));
            }
        }
    } else {
        logger.warn(`Keycloak client not available, pretending user logged out`);
    }

    const enforceLogin = shouldMiddlewareEnforceLogin(
        context.url.pathname,
        getConfiguredOrganisms().map((it) => it.key),
    );

    if (enforceLogin && (verifiedToken === undefined || verifiedToken.isErr())) {
        if (client === undefined) {
            logger.error(`Keycloak client not available, cannot redirect to auth`);
            return context.redirect('/503?service=Authentication');
        }
        return redirectToAuth(context);
    }

    if (token === undefined || verifiedToken === undefined) {
        context.locals.session = {
            isLoggedIn: false,
        };

        return next();
    }

    if (verifiedToken.isErr()) {
        context.locals.session = {
            isLoggedIn: false,
        };
        logger.debug(`Error verifying token: ${JSON.stringify(verifiedToken.error)}`);
        logger.debug(`Clearing auth cookies.`);
        deleteCookie(context);
        return next();
    }

    context.locals.session = {
        isLoggedIn: true,
        user: {
            name: verifiedToken.value.name ?? 'Name not set',
            username: verifiedToken.value.preferred_username as string,
            email: verifiedToken.value.email as string,
            emailVerified: verifiedToken.value.email_verified as boolean,
        },
        token,
    };

    return next();
});

async function getTokenFromCookie(context: APIContext, client: BaseClient) {
    const accessToken = context.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    const refreshToken = context.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

    if (accessToken === undefined || refreshToken === undefined) {
        return undefined;
    }
    const tokenCookie = {
        accessToken,
        refreshToken,
    };

    const verifiedTokenResult = await verifyToken(accessToken, client);
    if (verifiedTokenResult.isErr() && verifiedTokenResult.error.type === TokenVerificationError.EXPIRED) {
        logger.debug(`Token expired, trying to refresh`);
        return refreshTokenViaKeycloak(tokenCookie, client);
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
        return err({
            type: TokenVerificationError.INVALID_TOKEN,
            message: 'Token does not contain kid',
        });
    }

    if (client.issuer.metadata.jwks_uri === undefined) {
        return err({
            type: TokenVerificationError.REQUEST_ERROR,
            message: `Keycloak client does not contain jwks_uri: ${JSON.stringify(client.issuer.metadata.jwks_uri)}`,
        });
    }

    const jwksClient = new JwksRsa.JwksClient({
        jwksUri: client.issuer.metadata.jwks_uri,
    });

    try {
        const signingKey = await jwksClient.getSigningKey(kid);
        return ok(jsonwebtoken.verify(accessToken, signingKey.getPublicKey()) as JwtPayload);
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

async function getTokenFromParams(context: APIContext, client: BaseClient): Promise<TokenCookie | undefined> {
    const params = client.callbackParams(context.url.toString());
    logger.debug(`Keycloak callback params: ${JSON.stringify(params)}`);
    if (params.code !== undefined) {
        const redirectUri = removeTokenCodeFromSearchParams(context.url);
        logger.debug(`Keycloak callback redirect uri: ${redirectUri}`);
        const tokenSet = await client
            .callback(redirectUri, params, {
                response_type: 'code', // eslint-disable-line @typescript-eslint/naming-convention
            })
            .catch((error: unknown) => {
                logger.info(`Keycloak callback error: ${error}`);
                return undefined;
            });
        return extractTokenCookieFromTokenSet(tokenSet);
    }
    return undefined;
}

function setCookie(context: APIContext, token: TokenCookie) {
    const runtimeConfig = getRuntimeConfig();
    logger.debug(`Setting token cookie`);
    context.cookies.set(ACCESS_TOKEN_COOKIE, token.accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: !runtimeConfig.insecureCookies,
        path: '/',
    });
    context.cookies.set(REFRESH_TOKEN_COOKIE, token.refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: !runtimeConfig.insecureCookies,
        path: '/',
    });
}

function deleteCookie(context: APIContext) {
    logger.debug(`Deleting token cookie`);
    try {
        context.cookies.delete(ACCESS_TOKEN_COOKIE, { path: '/' });
        context.cookies.delete(REFRESH_TOKEN_COOKIE, { path: '/' });
    } catch {
        logger.info(`Error deleting cookie`);
    }
}

// https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Basic_concepts#guard
// URL must be absolute, otherwise throws TypeError
const createRedirectWithModifiableHeaders = (url: string) => {
    logger.debug(`Redirecting to ${url}`);
    const redirect = Response.redirect(url);
    return new Response(null, { status: redirect.status, headers: redirect.headers });
};

const redirectToAuth = async (context: APIContext) => {
    const currentUrl = context.url;
    const redirectUrl = removeTokenCodeFromSearchParams(currentUrl);

    logger.debug(`Redirecting to auth with redirect url: ${redirectUrl}`);
    const authUrl = await getAuthUrl(redirectUrl);

    deleteCookie(context);
    return createRedirectWithModifiableHeaders(authUrl);
};

function removeTokenCodeFromSearchParams(url: URL): string {
    const newUrl = new URL(url.toString());

    newUrl.searchParams.delete('code');
    newUrl.searchParams.delete('session_state');
    newUrl.searchParams.delete('iss');

    return newUrl.toString();
}

async function refreshTokenViaKeycloak(token: TokenCookie, client: BaseClient): Promise<TokenCookie | undefined> {
    const refreshedTokenSet = await client.refresh(token.refreshToken).catch(() => {
        logger.info(`Failed to refresh token`);
        return undefined;
    });
    return extractTokenCookieFromTokenSet(refreshedTokenSet);
}

function extractTokenCookieFromTokenSet(tokenSet: TokenSet | undefined): TokenCookie | undefined {
    const accessToken = tokenSet?.access_token;
    const refreshToken = tokenSet?.refresh_token;

    if (tokenSet === undefined || accessToken === undefined || refreshToken === undefined) {
        logger.error(`Error extracting token cookie from token set`);
        return undefined;
    }

    return {
        accessToken,
        refreshToken,
    };
}
