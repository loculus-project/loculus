import type { APIContext } from 'astro';
import { defineMiddleware } from 'astro/middleware';
import { ResultAsync } from 'neverthrow';
import { type BaseClient, Issuer, type TokenSet } from 'openid-client';

import { getConfiguredOrganisms, getRuntimeConfig } from './config.ts';
import { getInstanceLogger } from './logger.ts';

export const TOKEN_COOKIE = 'token';

let _publicRoutes: RegExp[] | undefined;
function getPublicRoutes() {
    if (_publicRoutes === undefined) {
        const organismSpecificRoutes = getConfiguredOrganisms().flatMap((organism) => [
            new RegExp(`^/${organism}/sequences(?:/.*)?$`),
            new RegExp(`^/${organism}/search$`),
            new RegExp(`^/${organism}/?$`),
        ]);

        _publicRoutes = [
            new RegExp('^/?$'),
            new RegExp('^/about$'),
            new RegExp('^/api_documentation$'),
            new RegExp('^/governance$'),
            new RegExp('^/status$'),
            new RegExp('^/logout$'),
            new RegExp('^/admin/logs.txt$'),
            ...organismSpecificRoutes,
        ];
    }
    return _publicRoutes;
}

export function isPublicRoute(pathname: string) {
    return getPublicRoutes().some((route) => route.test(pathname));
}

export const clientMetadata = {
    client_id: 'test-cli',
    response_types: ['code', 'id_token'],
    client_secret: 'someSecret',
    public: true,
};

export const realmPath = '/realms/pathoplexusRealm';

let _keycloakClient: BaseClient | undefined;

const logger = getInstanceLogger('LoginMiddleware');

export async function getKeycloakClient() {
    if (_keycloakClient === undefined) {
        const originForClient = getRuntimeConfig().forServer.keycloakUrl;

        const issuerUrl = `${originForClient}${realmPath}`;

        logger.info(`Getting keycloak client for issuer url: ${issuerUrl}`);
        const keycloakIssuer = await Issuer.discover(issuerUrl);

        _keycloakClient = new keycloakIssuer.Client(clientMetadata);
    }

    return _keycloakClient;
}

export const onRequest = defineMiddleware(async (context, next) => {
    let token = await getTokenFromCookie(context);

    if (isPublicRoute(context.url.pathname)) {
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
            user: { name: userInfo.value.name ?? 'Username not set' },
            token,
        };

        return next();
    }

    if (token === undefined) {
        token = await getTokenFromParams(context);
        if (token !== undefined) {
            setCookie(context, token);
        } else {
            return redirectToAuth(context);
        }
    }

    const userInfo = await getUserInfo(token);

    if (userInfo.isErr()) {
        logger.error(`Error getting user info: ${userInfo.error}`);
        return redirectToAuth(context);
    }

    context.locals.session = {
        isLoggedIn: true,
        user: { name: userInfo.value.name ?? 'Username not set' },
        token,
    };

    return next();
});

async function getTokenFromCookie(context: APIContext) {
    const tokenCookie = context.cookies.get(TOKEN_COOKIE)?.value;

    let token = parseToken(tokenCookie);
    if (token === undefined) {
        return undefined;
    }

    if (hasExpired(token)) {
        token = await refreshToken(token);
    }

    return token;
}

export function parseToken(tokenValue: string | undefined) {
    if (tokenValue === undefined) {
        return undefined;
    }

    const token: TokenSet | undefined = JSON.parse(tokenValue);
    return token;
}

async function getUserInfo(token: TokenSet) {
    return ResultAsync.fromPromise((await getKeycloakClient()).userinfo(token.access_token!), (error) => {
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
        return client
            .callback(redirectUri, params, {
                response_type: 'code',
            })
            .catch((error) => {
                logger.error(`Keycloak callback error: ${error}`);
                return undefined;
            });
    }
    return undefined;
}

function setCookie(context: APIContext, token: TokenSet) {
    context.cookies.set(TOKEN_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: false });
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

function hasExpired(token: TokenSet) {
    return typeof token.expires_at === 'number' && token.expires_at < Math.floor(Date.now() / 1000);
}

function removeTokenCodeFromSearchParams(url: URL) {
    const newUrl = new URL(url.toString());

    newUrl.searchParams.delete('code');
    newUrl.searchParams.delete('session_state');
    newUrl.searchParams.delete('iss');

    return newUrl.toString();
}

async function refreshToken(token: TokenSet) {
    return (await getKeycloakClient()).refresh(token.refresh_token!).catch(() => undefined);
}
