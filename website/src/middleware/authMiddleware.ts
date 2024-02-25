import type { APIContext } from 'astro';
import { defineMiddleware } from 'astro/middleware';
import jsonwebtoken from 'jsonwebtoken';
import JwksRsa from 'jwks-rsa';
import { err, ok, ResultAsync } from 'neverthrow';
import { type BaseClient, Issuer, type TokenSet } from 'openid-client';

import { getConfiguredOrganisms, getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { shouldMiddlewareEnforceLogin } from '../utils/shouldMiddlewareEnforceLogin.ts';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

enum TokenVerificationError {
    EXPIRED,
    REQUEST_ERROR,
    INVALID_TOKEN,
}

export const clientMetadata = {
    client_id: 'test-cli', // TODO: #1100 Replace with actual client id
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

export const getAuthUrl = async (redirectUrl: string) => {
    const authUrl = (await getKeycloakClient()).authorizationUrl({
        redirect_uri: redirectUrl,
        scope: 'openid',
        response_type: 'code',
    });
    return authUrl;
};

async function getValidTokenAndUserInfoFromCookie(context: APIContext) {
    logger.debug(`Trying to get token and user info from cookie`);
    const token = await getTokenFromCookie(context);
    if (token !== undefined) {
        const userInfo = await getUserInfo(token);

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

async function getValidTokenAndUserInfoFromParams(context: APIContext) {
    logger.debug(`Trying to get token and user info from params`);
    const token = await getTokenFromParams(context);
    if (token !== undefined) {
        const userInfo = await getUserInfo(token);

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
    let { token, userInfo } = (await getValidTokenAndUserInfoFromCookie(context)) ?? {};
    if (token === undefined) {
        const paramResult = await getValidTokenAndUserInfoFromParams(context);
        token = paramResult?.token;
        userInfo = paramResult?.userInfo;

        if (token !== undefined) {
            logger.debug(`Token found in params, setting cookie`);
            setCookie(context, token);
            return createRedirectWithModifiableHeaders(removeTokenCodeFromSearchParams(context.url));
        }
    }

    const enforceLogin = shouldMiddlewareEnforceLogin(
        context.url.pathname,
        getConfiguredOrganisms().map((it) => it.key),
    );

    if (enforceLogin && (userInfo === undefined || userInfo.isErr())) {
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

    const verifiedTokenResult = await verifyToken(accessToken);
    if (verifiedTokenResult.isErr() && verifiedTokenResult.error.type === TokenVerificationError.EXPIRED) {
        logger.debug(`Token expired, trying to refresh`);
        return refreshTokenViaKeycloak(tokenCookie);
    }
    if (verifiedTokenResult.isErr()) {
        logger.info(`Error verifying token: ${verifiedTokenResult.error.message}`);
        return undefined;
    }
    logger.debug(`Token successfully verified, returning it`);

    return tokenCookie;
}

async function verifyToken(accessToken: string) {
    logger.debug(`Verifying token`);
    const tokenHeader = jsonwebtoken.decode(accessToken, { complete: true })?.header;
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

async function getUserInfo(token: TokenCookie) {
    return ResultAsync.fromPromise((await getKeycloakClient()).userinfo(token.accessToken), (error) => {
        logger.debug(`Error getting user info: ${error}`);
        return error;
    });
}

async function getTokenFromParams(context: APIContext): Promise<TokenCookie | undefined> {
    const client = await getKeycloakClient();

    const params = client.callbackParams(context.url.toString());
    logger.debug(`Keycloak callback params: ${JSON.stringify(params)}`);
    if (params.code !== undefined) {
        const redirectUri = removeTokenCodeFromSearchParams(context.url).replace("http://","https://");
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

export function setCookie(context: APIContext, token: TokenCookie) {
    logger.debug(`Setting token cookie`);
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
const createRedirectWithModifiableHeaders = (url: string) => {
    const redirect = Response.redirect(url);
    logger.debug(`Redirecting to ${url}`);
    return new Response(null, { status: redirect.status, headers: redirect.headers });
};

const redirectToAuth = async (context: APIContext) => {
    const currentUrl = context.url;
    const redirectUrl = removeTokenCodeFromSearchParams(currentUrl).replace("http://", "https://");

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

    return newUrl.toString().replace("http://","https://");
}

async function refreshTokenViaKeycloak(token: TokenCookie): Promise<TokenCookie | undefined> {
    const refreshedTokenSet = await (await getKeycloakClient()).refresh(token.refreshToken).catch(() => {
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
