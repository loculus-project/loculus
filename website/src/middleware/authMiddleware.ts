import type { APIContext } from 'astro';
import { defineMiddleware } from 'astro/middleware';
import jsonwebtoken from 'jsonwebtoken';
import JwksRsa from 'jwks-rsa';
import { err, ok, ResultAsync } from 'neverthrow';
import { type BaseClient, Issuer, type TokenSet } from 'openid-client';

import { getConfiguredOrganisms, getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { shouldMiddlewareEnforceLogin } from '../utils/shouldMiddlewareEnforceLogin.ts';

const { decode, verify } = jsonwebtoken;

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

enum TokenVerificationError {
    EXPIRED,
    REQUEST_ERROR,
    INVALID_TOKEN,
}

export const clientMetadata = {
    client_id: 'test-cli',
    response_types: ['code', 'id_token'],
    client_secret: 'someSecret',
    public: true,
};

export const realmPath = '/realms/loculusRealm';

let _keycloakClient: BaseClient | undefined;

const logger = getInstanceLogger('LoginMiddleware');

export async function getKeycloakClient() {
    if (_keycloakClient === undefined) {
        const originForClient = getRuntimeConfig().serverSide.keycloakUrl;

        const issuerUrl = `${originForClient}${realmPath}`;

        logger.info(`Getting keycloak client for issuer url: ${issuerUrl}`);
        const keycloakIssuer = await Issuer.discover(issuerUrl);

        _keycloakClient = new keycloakIssuer.Client(clientMetadata);
    }

    return _keycloakClient;
}

export const getAuthUrl = async (redirectUrl: URL) => {
    logger.debug(`Getting auth url for redirect url: ${redirectUrl}`);
    const redirectUrlBare = removeTokenCodeFromSearchParams(redirectUrl);
    const redirectUrlHttps = redirectUrlBare.replace('http://', 'https://');
    const authUrl = (await getKeycloakClient()).authorizationUrl({
        redirect_uri: redirectUrlHttps,
        scope: 'openid',
        response_type: 'code',
    });
    const authUrlHttps = authUrl.replace('http://', 'https://');
    logger.debug(`Final auth url: ${authUrlHttps}`);
    return authUrlHttps;
};

async function getValidTokenFromCookies(context: APIContext) {
    const token = await getTokenFromCookie(context);
    if (token !== undefined) {
        const userInfo = await getUserInfo(token);

        if (userInfo.isErr()) {
            logger.debug(`Cookie token found but could not get user info`);
            deleteCookie(context);
            return undefined;
        }

        return token;
    }
    return undefined;
}

async function getValidTokenFromParams(context: APIContext) {
    const token = await getTokenFromParams(context);
    if (token !== undefined) {
        const userInfo = await getUserInfo(token);

        if (userInfo.isErr()) {
            logger.debug(`Token found in params but could not get user info`);
            return undefined;
        }

        return token;
    }
    return undefined;
}

export const authMiddleware = defineMiddleware(async (context, next) => {
    let token = await getValidTokenFromCookies(context);
    if (token === undefined) {
        logger.debug(`No valid token found in cookies. Cookies: ${JSON.stringify(context.cookies)}`);
        token = await getValidTokenFromParams(context);
        if (token !== undefined) {
            logger.debug(`Token found in params, setting cookie`);
            setCookie(context, token);
        } else {
            logger.debug(`No token found in params`);
        }
    }

    const enforceLogin = shouldMiddlewareEnforceLogin(
        context.url.pathname,
        getConfiguredOrganisms().map((it) => it.key),
    );
    if (!enforceLogin) {
        logger.debug(`Not enforcing login for path: ${context.url.pathname}`);
        if (token === undefined) {
            context.locals.session = {
                isLoggedIn: false,
            };

            logger.debug(`No token found, not enforcing login`);

            return next();
        }

        logger.debug(
            `Token found, trying to get user info despite not enforcing login for path: ${context.url.pathname}`,
        );

        const userInfo = await getUserInfo(token);

        if (userInfo.isErr()) {
            context.locals.session = {
                isLoggedIn: false,
            };
            logger.debug(`Token found but could not get user info, not enforcing login`);
            return next();
        }

        logger.debug(`User authenticated, setting session and continuing`);

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
    }

    logger.debug(`Enforcing login for path: ${context.url.pathname}`);

    if (token === undefined) {
        logger.debug(`No token found, redirecting to auth`);
        return redirectToAuth(context);
    }

    const userInfo = await getUserInfo(token);
    if (userInfo.isErr()) {
        logger.debug(`Failed to get user info, redirecting to auth`);
        deleteCookie(context);
        return redirectToAuth(context);
    }

    logger.debug(`User authenticated, setting session and continuing`);
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

async function getTokenFromCookie(context: APIContext) {
    const accessToken = context.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    const refreshToken = context.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

    if (accessToken === undefined || refreshToken === undefined) {
        return undefined;
    }
    const tokenCookie = {
        accessToken,
        refreshToken,
    };

    const verifiedTokenResult = await verifyToken(tokenCookie.accessToken);
    if (verifiedTokenResult.isErr() && verifiedTokenResult.error.type === TokenVerificationError.EXPIRED) {
        deleteCookie(context);
        const refreshedToken = await refreshTokenViaKeycloak(tokenCookie).catch((error) => {
            logger.info(`Error refreshing token: ${error}`);
            return undefined;
        });
        if (refreshedToken === undefined) {
            return undefined;
        }
        setCookie(context, refreshedToken);
        return refreshedToken;
    }
    if (verifiedTokenResult.isErr()) {
        logger.info(`Error verifying token: ${verifiedTokenResult.error.message}`);
        deleteCookie(context);
        return undefined;
    }

    return tokenCookie;
}

async function verifyToken(accessToken: string) {
    const tokenHeader = decode(accessToken, { complete: true })?.header;
    const kid = tokenHeader?.kid;
    if (kid === undefined) {
        return err({
            type: TokenVerificationError.INVALID_TOKEN,
            message: 'Token does not contain kid',
        });
    }

    const keycloakClient = await getKeycloakClient();

    if (keycloakClient.issuer.metadata.jwks_uri === undefined) {
        return err({
            type: TokenVerificationError.REQUEST_ERROR,
            message: `Keycloak client does not contain jwks_uri: ${JSON.stringify(
                keycloakClient.issuer.metadata.jwks_uri,
            )}`,
        });
    }

    const jwksClient = new JwksRsa.JwksClient({
        jwksUri: keycloakClient.issuer.metadata.jwks_uri,
    });

    try {
        const signingKey = await jwksClient.getSigningKey(kid);
        return ok(verify(accessToken, signingKey.getPublicKey()));
    } catch (error) {
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

async function getUserInfo(token: TokenCookie) {
    logger.debug(`Getting user info for token: ${JSON.stringify(token)}`);
    return ResultAsync.fromPromise((await getKeycloakClient()).userinfo(token.accessToken), (error) => {
        logger.info(`Error getting user info: ${error}`);
        return error;
    });
}

async function getTokenFromParams(context: APIContext) {
    logger.debug(`Getting token from params`);
    const client = await getKeycloakClient();

    const params = client.callbackParams(context.url.toString());
    logger.debug(`Keycloak callback params: ${JSON.stringify(params)}`);
    if (params.code !== undefined) {
        logger.debug(`Code found in params, trying to get token`);
        const redirectUriHttp = removeTokenCodeFromSearchParams(context.url);
        const redirectUri = redirectUriHttp.replace('http://', 'https://');
        logger.debug(`Keycloak callback redirect uri: ${redirectUri}`);
        const tokenSet = await client
            .callback(redirectUri, params, {
                response_type: 'code',
            })
            .catch((error) => {
                logger.info(`Keycloak callback error: ${error}`);
                return undefined;
            });
        logger.debug(`Token set: ${JSON.stringify(tokenSet)}`);
        return extractTokenCookieFromTokenSet(tokenSet);
    }
    return undefined;
}

export function setCookie(context: APIContext, token: TokenCookie) {
    logger.debug(
        `Setting cookie for token: ${JSON.stringify(token)}. Cookies before setting: ${JSON.stringify(context.cookies.get(ACCESS_TOKEN_COOKIE))}`,
    );
    context.cookies.set(ACCESS_TOKEN_COOKIE, token.accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
    });
    context.cookies.set(REFRESH_TOKEN_COOKIE, token.refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
    });
    logger.debug(`Cookie set. Cookies now: ${JSON.stringify(context.cookies.get(ACCESS_TOKEN_COOKIE))}`);
}

function deleteCookie(context: APIContext) {
    logger.debug(
        `Deleting cookies. Cookies before deletion: ${JSON.stringify(context.cookies.get(ACCESS_TOKEN_COOKIE))}`,
    );
    try {
        context.cookies.delete(ACCESS_TOKEN_COOKIE, { path: '/' });
        context.cookies.delete(REFRESH_TOKEN_COOKIE, { path: '/' });
    } catch {
        logger.info(`Error deleting cookie`);
    }
    logger.debug(`Cookies after deletion: ${JSON.stringify(context.cookies.get(ACCESS_TOKEN_COOKIE))}`);
}

// https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Basic_concepts#guard
const createRedirectWithModifiableHeaders = (url: string) => {
    const redirect = Response.redirect(url);
    logger.info(`Redirecting to ${url}`);
    return new Response(null, { status: redirect.status, headers: redirect.headers });
};

const redirectToAuth = async (context: APIContext) => {
    const currentUrl = context.url;

    const authUrl = await getAuthUrl(currentUrl);
    logger.debug(`Redirecting to auth url: ${authUrl} from current url: ${currentUrl}`);

    deleteCookie(context);
    return createRedirectWithModifiableHeaders(authUrl);
};

function removeTokenCodeFromSearchParams(url: URL) {
    const newUrl = new URL(url.toString());

    logger.debug(
        `Removing tokenCode from search params. Search params before removal: ${newUrl.searchParams.toString()}`,
    );
    newUrl.searchParams.delete('code');
    newUrl.searchParams.delete('session_state');
    newUrl.searchParams.delete('iss');
    logger.debug(`Search params after removal: ${newUrl.searchParams.toString()}`);

    return newUrl.toString();
}

async function refreshTokenViaKeycloak(token: TokenCookie) {
    const refreshedTokenSet = await (await getKeycloakClient()).refresh(token.refreshToken).catch((error) => {
        logger.info(`Error refreshing token: ${error.message}`);
        return undefined;
    });
    return extractTokenCookieFromTokenSet(refreshedTokenSet);
}

function extractTokenCookieFromTokenSet(tokenSet: TokenSet | undefined) {
    if (tokenSet === undefined || tokenSet.access_token === undefined || tokenSet.refresh_token === undefined) {
        logger.info(`Could not extract tokens from tokenSet=${JSON.stringify(tokenSet)}`);
        return undefined;
    }

    return {
        accessToken: tokenSet.access_token,
        refreshToken: tokenSet.refresh_token,
    };
}
