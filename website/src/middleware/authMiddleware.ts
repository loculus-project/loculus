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

export const authMiddleware = defineMiddleware(async (context, next) => {
    let token = await getTokenFromCookie(context);

    const enforceLogin = shouldMiddlewareEnforceLogin(
        context.url.pathname,
        getConfiguredOrganisms().map((it) => it.key),
    );
    if (!enforceLogin) {
        if (token === undefined) {
            context.locals.session = {
                isLoggedIn: false,
            };

            return next();
        }

        const userInfo = await getUserInfo(token);

        if (userInfo.isErr()) {
            context.locals.session = {
                isLoggedIn: false,
            };
            return next();
        }

        context.locals.session = {
            isLoggedIn: true,
            user: {
                name: userInfo.value.name ?? 'Username not set',
                username: userInfo.value.preferred_username,
            },
            token,
        };

        return next();
    }

    if (token === undefined) {
        token = await getTokenFromParams(context);
        if (token !== undefined) {
            logger.debug(`Token found in params, setting cookie`);
            setCookie(context, token);
        } else {
            logger.debug(`No token found, redirecting to auth`);
            return redirectToAuth(context);
        }
    }

    const userInfo = await getUserInfo(token);
    if (userInfo.isErr()) {
        logger.error(`Error getting user info: ${userInfo.error}`);
        deleteCookie(context);
        return redirectToAuth(context);
    }

    context.locals.session = {
        isLoggedIn: true,
        user: {
            name: userInfo.value.name ?? 'Username not set',
            username: userInfo.value.preferred_username,
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
        return refreshTokenViaKeycloak(tokenCookie);
    }
    if (verifiedTokenResult.isErr()) {
        logger.error(`Error verifying token: ${verifiedTokenResult.error.message}`);
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
    return ResultAsync.fromPromise((await getKeycloakClient()).userinfo(token.accessToken), (error) => {
        return error;
    });
}

async function getTokenFromParams(context: APIContext) {
    const client = await getKeycloakClient();

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
                logger.error(`Keycloak callback error: ${error}`);
                return undefined;
            });
        return extractTokenCookieFromTokenSet(tokenSet);
    }
    return undefined;
}

export function setCookie(context: APIContext, token: TokenCookie) {
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
    try {
        context.cookies.delete(ACCESS_TOKEN_COOKIE, { path: '/' });
        context.cookies.delete(REFRESH_TOKEN_COOKIE, { path: '/' });
    } catch {
        logger.error(`Error deleting cookie`);
    }
}

const redirectToAuth = async (context: APIContext) => {
    const currentUrl = context.url;
    const redirectUrl = removeTokenCodeFromSearchParams(currentUrl);

    const authUrl = (await getKeycloakClient()).authorizationUrl({
        redirect_uri: redirectUrl,
        scope: 'openid',
        response_type: 'code',
    });

    return Response.redirect(authUrl);
};

function removeTokenCodeFromSearchParams(url: URL) {
    const newUrl = new URL(url.toString());

    newUrl.searchParams.delete('code');
    newUrl.searchParams.delete('session_state');
    newUrl.searchParams.delete('iss');

    return newUrl.toString();
}

async function refreshTokenViaKeycloak(token: TokenCookie) {
    const refreshedTokenSet = await (await getKeycloakClient()).refresh(token.refreshToken).catch(() => undefined);
    return extractTokenCookieFromTokenSet(refreshedTokenSet);
}

function extractTokenCookieFromTokenSet(tokenSet: TokenSet | undefined) {
    if (tokenSet === undefined || tokenSet.access_token === undefined || tokenSet.refresh_token === undefined) {
        return undefined;
    }

    return {
        accessToken: tokenSet.access_token,
        refreshToken: tokenSet.refresh_token,
    };
}
