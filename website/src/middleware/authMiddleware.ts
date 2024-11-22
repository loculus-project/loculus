import type { APIContext } from 'astro';
import { defineMiddleware } from 'astro/middleware';
import jsonwebtoken from 'jsonwebtoken';
import JwksRsa from 'jwks-rsa';
import { err, ok, ResultAsync } from 'neverthrow';
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

    const client = await KeycloakClientManager.getClient();
    if (client !== undefined) {
        // Only run this when keycloak up
        const cookieResult = await getValidTokenAndUserInfoFromCookie(context, client);
        token = cookieResult?.token;
        userInfo = cookieResult?.userInfo;
        if (token === undefined) {
            const paramResult = await getValidTokenAndUserInfoFromParams(context, client);
            token = paramResult?.token;
            userInfo = paramResult?.userInfo;

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

    if (enforceLogin && (userInfo === undefined || userInfo.isErr())) {
        if (client === undefined) {
            logger.error(`Keycloak client not available, cannot redirect to auth`);
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
    logger.debug(`Verifying token: ${accessToken}`);
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

    // Helper to safely stringify anything for logging
    function stringifyForLog(obj: any, indent: boolean = false): string {
        try {
            return JSON.stringify(
                obj,
                (key, value) => {
                    // Handle special cases like undefined, functions, etc.
                    if (value === undefined) return 'undefined';
                    if (value === null) return 'null';
                    if (value instanceof Error) {
                        return {
                            stack: value.stack,
                            ...value, // Get any custom properties
                        };
                    }
                    return value;
                },
                indent ? 2 : undefined,
            );
        } catch (e) {
            return `[Error stringifying log: ${e}]`;
        }
    }

    try {
        // Log the full input
        logger.debug(
            `Attempting to verify token: ${stringifyForLog({
                kid,
                fullToken: accessToken,
                decodedToken: jsonwebtoken.decode(accessToken, { complete: true }),
            })}`,
        );

        const signingKey = await jwksClient.getSigningKey(kid);
        logger.debug(
            `Retrieved signing key: ${stringifyForLog({
                publicKey: signingKey.getPublicKey(),
                ...signingKey,
            })}`,
        );

        const verified = jsonwebtoken.verify(accessToken, signingKey.getPublicKey());
        logger.debug(`Token verified successfully: ${stringifyForLog(verified)}`);

        return ok(verified);
    } catch (error: any) {
        logger.error(
            `Error verifying token: ${stringifyForLog(
                {
                    debugContext: {
                        kid,
                        fullToken: accessToken,
                        decodedToken: jsonwebtoken.decode(accessToken, { complete: true }),
                        jwksClient: {
                            ...jwksClient,
                        },
                    },
                    error: {
                        name: error.name,
                        message: error.message,
                        stack: error.stack,
                        ...(error instanceof AggregateError && {
                            errors: error.errors.map((e) => ({
                                name: e.name,
                                message: e.message,
                                stack: e.stack,
                            })),
                        }),
                        ...error,
                    },
                },
                true,
            )}`,
        ); // true for indentation on error logs

        switch ((error as Error).name) {
            case 'TokenExpiredError':
                return err({
                    type: TokenVerificationError.EXPIRED,
                    message: error.message,
                });
            case 'JsonWebTokenError':
                return err({
                    type: TokenVerificationError.INVALID_TOKEN,
                    message: error.message,
                });
            default:
                return err({
                    type: TokenVerificationError.REQUEST_ERROR,
                    message: error.message,
                });
        }
    }
}

async function getUserInfo(token: TokenCookie, client: BaseClient) {
    return ResultAsync.fromPromise(client.userinfo(token.accessToken), (error) => {
        logger.debug(`Error getting user info: ${error}`);
        return error;
    });
}

async function getTokenFromParams(context: APIContext, client: BaseClient): Promise<TokenCookie | undefined> {
    const params = client.callbackParams(context.url.toString());
    logger.debug(`Keycloak callback params: ${JSON.stringify(params)}`);
    if (params.code !== undefined) {
        const redirectUri = removeTokenCodeFromSearchParams(context.url);
        logger.debug(`Keycloak callback redirect uri: ${redirectUri}`);
        const tokenSet = await client
            .callback(redirectUri, params, {
                response_type: 'code',
            })
            .catch((error) => {
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
