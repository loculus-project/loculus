import type { APIContext } from 'astro';
import { defineMiddleware } from 'astro/middleware';
import jsonwebtoken from 'jsonwebtoken';
import JwksRsa from 'jwks-rsa';
import { err, ok, ResultAsync } from 'neverthrow';
import { type BaseClient, type TokenSet } from 'openid-client';
import { z } from 'zod';

import { getConfiguredOrganisms, getRuntimeConfig, getWebsiteConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { routes } from '../routes/routes.ts';
import { KeycloakClientManager } from '../utils/KeycloakClientManager.ts';
import { authTransactionId, consumeAuthRequest } from '../utils/authRequestCookies.ts';
import { getLoginUrl } from '../utils/getLoginUrl.ts';
import { shouldMiddlewareEnforceLogin } from '../utils/shouldMiddlewareEnforceLogin.ts';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

enum TokenVerificationError {
    EXPIRED,
    REQUEST_ERROR,
    INVALID_TOKEN,
}

const logger = getInstanceLogger('LoginMiddleware');

/**
 * The user info that the website needs, read from the (verified) access token.
 * Keycloak puts these claims into the access token via the default `profile` and `email` scopes;
 * the backend reads `preferred_username` from the access token as well.
 */
const accessTokenClaims = z.object({
    /* eslint-disable @typescript-eslint/naming-convention */
    preferred_username: z.string(),
    name: z.string().optional(),
    email: z.string().optional(),
    email_verified: z.boolean().optional(),
    /* eslint-enable @typescript-eslint/naming-convention */
});
type AccessTokenClaims = z.infer<typeof accessTokenClaims>;

/**
 * Verifies the token from the cookie locally (no request to Keycloak, apart from fetching the signing keys once),
 * refreshes it if it has expired, and writes a refreshed token back to the cookie.
 */
async function getValidTokenAndClaimsFromCookie(context: APIContext, client: BaseClient) {
    logger.debug(`Trying to get token and user info from cookie`);
    const result = await getTokenFromCookie(context, client);
    if (result === undefined) {
        return undefined;
    }

    const claims = accessTokenClaims.safeParse(result.payload);
    if (!claims.success) {
        logger.info(`Access token is missing required claims: ${claims.error.message}`);
        deleteCookie(context);
        return undefined;
    }

    if (result.refreshed) {
        logger.debug(`Token was refreshed, updating token cookie`);
        setCookie(context, result.token);
    }
    return { token: result.token, claims: claims.data };
}

async function getValidTokenAndUserInfoFromParams(context: APIContext, client: BaseClient) {
    logger.debug(`Trying to get token and user info from params`);
    const callbackResult = await getTokenFromParams(context, client);
    if (callbackResult !== undefined) {
        const userInfo = await getUserInfo(callbackResult.token, client);

        if (userInfo.isErr()) {
            logger.info(`OIDC login rejected: transactionId=${callbackResult.transactionId} reason=userinfo_failed`);
            return undefined;
        }
        logger.info(
            `OIDC login completed: transactionId=${callbackResult.transactionId} ` +
                `issuer=${client.issuer.metadata.issuer} subject=${userInfo.value.sub}`,
        );
        return {
            token: callbackResult.token,
            userInfo,
            returnTo: callbackResult.returnTo,
        };
    }
    return undefined;
}

export const authMiddleware = defineMiddleware(async (context, next) => {
    let token: TokenCookie | undefined;
    let claims: AccessTokenClaims | undefined;

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

    const client = await KeycloakClientManager.getClient();
    if (client !== undefined) {
        // Only run this when keycloak up
        if (context.url.pathname === routes.authCallback()) {
            const paramResult = await getValidTokenAndUserInfoFromParams(context, client);
            if (paramResult !== undefined) {
                logger.debug(`Valid OIDC callback, setting token cookies`);
                setCookie(context, paramResult.token);
                return createRedirectWithModifiableHeaders(paramResult.returnTo);
            }
        }

        const cookieResult = await getValidTokenAndClaimsFromCookie(context, client);
        token = cookieResult?.token;
        claims = cookieResult?.claims;
    } else {
        logger.warn(`Keycloak client not available, pretending user logged out`);
    }

    const enforceLogin = shouldMiddlewareEnforceLogin(
        context.url.pathname,
        getConfiguredOrganisms().map((it) => it.key),
    );

    if (enforceLogin && claims === undefined) {
        if (client === undefined) {
            logger.error(`Keycloak client not available, cannot redirect to auth`);
            return context.redirect('/503?service=Authentication');
        }
        return redirectToAuth(context);
    }

    if (token === undefined || claims === undefined) {
        context.locals.session = {
            isLoggedIn: false,
        };

        return next();
    }

    context.locals.session = {
        isLoggedIn: true,
        user: {
            name: claims.name ?? 'Name not set',
            username: claims.preferred_username,
            email: claims.email,
            emailVerified: claims.email_verified,
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
        const refreshedToken = await refreshTokenViaKeycloak(tokenCookie, client);
        if (refreshedToken === undefined) {
            return undefined;
        }
        const verifiedRefreshedToken = await verifyToken(refreshedToken.accessToken, client);
        if (verifiedRefreshedToken.isErr()) {
            logger.info(`Error verifying refreshed token: ${verifiedRefreshedToken.error.message}`);
            return undefined;
        }
        return { token: refreshedToken, payload: verifiedRefreshedToken.value, refreshed: true };
    }
    if (verifiedTokenResult.isErr()) {
        logger.info(`Error verifying token: ${verifiedTokenResult.error.message}`);
        return undefined;
    }
    logger.debug(`Token successfully verified, returning it`);

    return { token: tokenCookie, payload: verifiedTokenResult.value, refreshed: false };
}

/**
 * One JWKS client per Keycloak realm, so that its signing key cache is reused across requests.
 * Unknown key IDs (e.g. after key rotation) still trigger a (rate limited) refetch.
 */
const jwksClients = new Map<string, JwksRsa.JwksClient>();

function getJwksClient(jwksUri: string) {
    let jwksClient = jwksClients.get(jwksUri);
    if (jwksClient === undefined) {
        jwksClient = new JwksRsa.JwksClient({ jwksUri, cache: true, rateLimit: true });
        jwksClients.set(jwksUri, jwksClient);
    }
    return jwksClient;
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

    const jwksClient = getJwksClient(client.issuer.metadata.jwks_uri);

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
    return ResultAsync.fromPromise(client.userinfo(token.accessToken), (error) => {
        logger.debug(`Error getting user info: ${error}`);
        return error;
    });
}

type CallbackResult = {
    token: TokenCookie;
    transactionId: string;
    returnTo: string;
};

export async function getTokenFromParams(context: APIContext, client: BaseClient): Promise<CallbackResult | undefined> {
    const params = client.callbackParams(context.url.toString());
    if (params.code === undefined && params.error !== undefined) {
        consumeAuthRequest(context.cookies, params.state);
        logger.info(
            `OIDC callback rejected: transactionId=${authTransactionId(params.state)} ` +
                `reason=provider_error error=${params.error}`,
        );
    }
    if (params.code !== undefined) {
        const transactionId = authTransactionId(params.state);
        logger.debug(
            `OIDC callback received: transactionId=${transactionId} ` +
                `hasCode=true hasState=${params.state !== undefined}`,
        );
        const callbackUrl = new URL(routes.authCallback(), context.url.origin).toString();
        // Removes the matching transaction from the cookie store before validation,
        // so this browser cannot retry it even if the code exchange fails.
        const authRequest = consumeAuthRequest(context.cookies, params.state);
        if (authRequest === undefined) {
            logger.info(`OIDC callback rejected: transactionId=${transactionId} reason=missing_or_expired_transaction`);
            return undefined;
        }
        const { nonce, codeVerifier } = authRequest;
        const tokenSet = await client
            .callback(callbackUrl, params, {
                code_verifier: codeVerifier, // eslint-disable-line @typescript-eslint/naming-convention
                response_type: 'code', // eslint-disable-line @typescript-eslint/naming-convention
                state: params.state,
                nonce,
            })
            .catch((error: unknown) => {
                logger.info(`OIDC callback rejected: transactionId=${transactionId} reason=validation_failed`);
                logger.debug(`OIDC callback validation error: transactionId=${transactionId} error=${error}`);
                return undefined;
            });
        const token = extractTokenCookieFromTokenSet(tokenSet);
        return token === undefined ? undefined : { token, transactionId, returnTo: authRequest.returnTo };
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

const redirectToAuth = (context: APIContext) => {
    const redirectUrl = context.url.toString();

    logger.debug(`Redirecting to auth with redirect url: ${redirectUrl}`);
    const authUrl = new URL(getLoginUrl(redirectUrl, context.url.origin), context.url.origin).toString();

    deleteCookie(context);
    return createRedirectWithModifiableHeaders(authUrl);
};

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
