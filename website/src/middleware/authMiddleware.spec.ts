import { generateKeyPairSync } from 'crypto';

import type { APIContext, AstroCookies } from 'astro';
import jsonwebtoken from 'jsonwebtoken';
import type { BaseClient } from 'openid-client';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getClient: vi.fn(),
    loggerInfo: vi.fn(),
    shouldMiddlewareEnforceLogin: vi.fn(),
    jwksClientCreated: vi.fn(),
    getSigningKey: vi.fn(),
}));

vi.mock('jwks-rsa', () => ({
    default: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        JwksClient: class {
            constructor(options: unknown) {
                mocks.jwksClientCreated(options);
            }
            getSigningKey = mocks.getSigningKey;
        },
    },
}));

vi.mock('../config.ts', () => ({
    getConfiguredOrganisms: () => [],
    getRuntimeConfig: () => ({
        insecureCookies: false,
        oidcTransactionCookieSecret: 'test-oidc-transaction-cookie-secret',
    }),
    getWebsiteConfig: () => ({ readOnlyMode: false }),
}));

vi.mock('../logger.ts', () => ({
    getInstanceLogger: () => ({
        debug: vi.fn(),
        error: vi.fn(),
        info: mocks.loggerInfo,
        warn: vi.fn(),
    }),
}));

vi.mock('../utils/KeycloakClientManager.ts', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    KeycloakClientManager: {
        getClient: mocks.getClient,
    },
}));

vi.mock('../utils/shouldMiddlewareEnforceLogin.ts', () => ({
    shouldMiddlewareEnforceLogin: mocks.shouldMiddlewareEnforceLogin,
}));

import { authMiddleware, getTokenFromParams } from './authMiddleware.ts';
import { addAuthRequest, consumeAuthRequest } from '../utils/authRequestCookies.ts';

describe('OIDC authentication middleware', () => {
    const values = new Map<string, string>();
    const cookies = {
        get: vi.fn((name: string) => {
            const value = values.get(name);
            return value === undefined ? undefined : { value };
        }),
        set: vi.fn((name: string, value: string) => values.set(name, value)),
        delete: vi.fn((name: string) => values.delete(name)),
    } as unknown as AstroCookies;

    const callback = vi.fn();
    const callbackParams = vi.fn((url: string) => {
        const searchParams = new URL(url).searchParams;
        return {
            code: searchParams.get('code') ?? undefined,
            error: searchParams.get('error') ?? undefined,
            state: searchParams.get('state') ?? undefined,
        };
    });
    const client = {
        callback,
        callbackParams,
        issuer: {
            metadata: {
                issuer: 'https://auth.test/realms/loculus',
            },
        },
    } as unknown as BaseClient;

    beforeEach(() => {
        values.clear();
        vi.clearAllMocks();
        mocks.getClient.mockResolvedValue(client);
        mocks.shouldMiddlewareEnforceLogin.mockReturnValue(false);
        /* eslint-disable @typescript-eslint/naming-convention */
        callback.mockResolvedValue({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
        });
        /* eslint-enable @typescript-eslint/naming-convention */
    });

    test('redirects a logged-out protected request through the absolute Astro login URL', async () => {
        mocks.shouldMiddlewareEnforceLogin.mockReturnValue(true);
        const context = {
            url: new URL('https://loculus.test/user'),
            cookies,
            locals: {},
        } as unknown as APIContext;
        const next = vi.fn();

        const response = (await authMiddleware(context, next)) as Response;

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('https://loculus.test/auth/login?returnTo=%2Fuser');
        expect(next).not.toHaveBeenCalled();
    });

    test.each(['/user', '/ebola/user', '/ebola/my_sequences'])(
        'preserves application query parameters when redirecting a logged-out request to %s',
        async (path) => {
            mocks.shouldMiddlewareEnforceLogin.mockReturnValue(true);
            const requestedUrl = new URL(
                `https://loculus.test${path}?state=pending&code=sample-code&iss=source&session_state=draft&filter=mine`,
            );
            const context = {
                url: requestedUrl,
                cookies,
                locals: {},
            } as unknown as APIContext;
            const next = vi.fn();

            const response = (await authMiddleware(context, next)) as Response;
            const location = new URL(response.headers.get('location')!);

            expect(response.status).toBe(302);
            expect(location.origin).toBe(requestedUrl.origin);
            expect(location.pathname).toBe('/auth/login');
            expect(new URL(location.searchParams.get('returnTo')!, requestedUrl.origin).toString()).toBe(
                requestedUrl.toString(),
            );
            expect(callbackParams).not.toHaveBeenCalled();
            expect(callback).not.toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
        },
    );

    test('uses the stored nonce and verifier with the fixed callback URI, then consumes the transaction', async () => {
        addAuthRequest(
            cookies,
            'expected-state',
            'expected-nonce',
            'expected-verifier',
            'https://loculus.test/ebola/submission',
        );
        const context = {
            url: new URL('https://loculus.test/auth/callback?code=authorization-code&state=expected-state'),
            cookies,
        } as APIContext;

        await expect(getTokenFromParams(context, client)).resolves.toEqual({
            token: {
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
            },
            transactionId: expect.any(String),
            returnTo: 'https://loculus.test/ebola/submission',
        });
        /* eslint-disable @typescript-eslint/naming-convention */
        expect(callback).toHaveBeenCalledWith(
            'https://loculus.test/auth/callback',
            {
                code: 'authorization-code',
                state: 'expected-state',
            },
            {
                code_verifier: 'expected-verifier',
                response_type: 'code',
                state: 'expected-state',
                nonce: 'expected-nonce',
            },
        );
        /* eslint-enable @typescript-eslint/naming-convention */

        await expect(getTokenFromParams(context, client)).resolves.toBeUndefined();
        expect(callback).toHaveBeenCalledTimes(1);
    });

    test('rejects an attacker callback without a matching browser transaction', async () => {
        const context = {
            url: new URL('https://loculus.test/auth/callback?code=attacker-code&state=attacker-state'),
            cookies,
        } as APIContext;

        await expect(getTokenFromParams(context, client)).resolves.toBeUndefined();
        expect(callback).not.toHaveBeenCalled();
    });

    test.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])(
        'rejects an unissued prototype-chain state %s before token exchange',
        async (state) => {
            addAuthRequest(cookies, 'real-state', 'nonce', 'verifier', 'https://loculus.test/user');
            const context = {
                url: new URL(`https://loculus.test/auth/callback?code=attacker-code&state=${state}`),
                cookies,
            } as APIContext;

            await expect(getTokenFromParams(context, client)).resolves.toBeUndefined();
            expect(callback).not.toHaveBeenCalled();
            expect(mocks.loggerInfo).toHaveBeenCalledWith(
                expect.stringContaining('reason=missing_or_expired_transaction'),
            );
            expect(consumeAuthRequest(cookies, 'real-state')).toEqual({
                nonce: 'nonce',
                codeVerifier: 'verifier',
                returnTo: 'https://loculus.test/user',
            });
        },
    );

    test('consumes the transaction and logs an error response returned by the OIDC provider', async () => {
        addAuthRequest(cookies, 'expected-state', 'expected-nonce', 'expected-verifier', 'https://loculus.test/user');
        const context = {
            url: new URL('https://loculus.test/auth/callback?error=access_denied&state=expected-state'),
            cookies,
        } as APIContext;

        await expect(getTokenFromParams(context, client)).resolves.toBeUndefined();
        expect(mocks.loggerInfo).toHaveBeenCalledWith(
            expect.stringMatching(
                /^OIDC callback rejected: transactionId=[a-f0-9]{12} reason=provider_error error=access_denied$/,
            ),
        );
        expect(callback).not.toHaveBeenCalled();
        expect(consumeAuthRequest(cookies, 'expected-state')).toBeUndefined();
    });
});

describe('authentication from the token cookie', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    /* eslint-disable @typescript-eslint/naming-convention */
    const signToken = (claims: Record<string, unknown>, expiresIn: number) =>
        jsonwebtoken.sign(claims, privateKey, { algorithm: 'RS256', keyid: 'key-1', expiresIn });
    const userClaims = {
        preferred_username: 'testuser',
        name: 'Test User',
        email: 'test@example.org',
        email_verified: true,
    };
    /* eslint-enable @typescript-eslint/naming-convention */

    const values = new Map<string, string>();
    const setCookie = vi.fn((name: string, value: string) => values.set(name, value));
    const cookies = {
        get: vi.fn((name: string) => {
            const value = values.get(name);
            return value === undefined ? undefined : { value };
        }),
        set: setCookie,
        delete: vi.fn((name: string) => values.delete(name)),
    } as unknown as AstroCookies;

    const userinfo = vi.fn();
    const refresh = vi.fn();
    const client = {
        userinfo,
        refresh,
        issuer: {
            metadata: {
                issuer: 'https://auth.test/realms/loculus',
                // eslint-disable-next-line @typescript-eslint/naming-convention
                jwks_uri: 'https://auth.test/realms/loculus/protocol/openid-connect/certs',
            },
        },
    } as unknown as BaseClient;

    async function runMiddleware() {
        const context = {
            url: new URL('https://loculus.test/api/backend/user/groups'),
            cookies,
            locals: {},
        } as unknown as APIContext;
        await authMiddleware(context, vi.fn());
        return context.locals.session;
    }

    beforeEach(() => {
        values.clear();
        vi.clearAllMocks();
        mocks.getClient.mockResolvedValue(client);
        mocks.shouldMiddlewareEnforceLogin.mockReturnValue(false);
        mocks.getSigningKey.mockResolvedValue({ getPublicKey: () => publicKeyPem });
    });

    test('reads the user from the verified access token without calling Keycloak', async () => {
        values.set('access_token', signToken(userClaims, 300));
        values.set('refresh_token', 'refresh-token');

        const session = await runMiddleware();

        expect(session).toMatchObject({
            isLoggedIn: true,
            user: { name: 'Test User', username: 'testuser', email: 'test@example.org', emailVerified: true },
        });
        expect(userinfo).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
        expect(setCookie).not.toHaveBeenCalled();
    });

    test('reuses the JWKS client across requests', async () => {
        values.set('access_token', signToken(userClaims, 300));
        values.set('refresh_token', 'refresh-token');

        await runMiddleware();
        await runMiddleware();

        // Created at most once in this file (the client is cached at module level), never per request
        expect(mocks.jwksClientCreated.mock.calls.length).toBeLessThanOrEqual(1);
        expect(mocks.getSigningKey).toHaveBeenCalledTimes(2);
    });

    test('refreshes an expired token and writes the refreshed token back to the cookie', async () => {
        const refreshedAccessToken = signToken({ ...userClaims, name: 'Refreshed User' }, 300);
        values.set('access_token', signToken(userClaims, -10));
        values.set('refresh_token', 'old-refresh-token');
        // eslint-disable-next-line @typescript-eslint/naming-convention
        refresh.mockResolvedValue({ access_token: refreshedAccessToken, refresh_token: 'new-refresh-token' });

        const session = await runMiddleware();

        expect(refresh).toHaveBeenCalledWith('old-refresh-token');
        expect(session).toMatchObject({ isLoggedIn: true, user: { name: 'Refreshed User' } });
        expect(values.get('access_token')).toBe(refreshedAccessToken);
        expect(values.get('refresh_token')).toBe('new-refresh-token');

        // The next request uses the refreshed token from the cookie instead of refreshing again
        await runMiddleware();
        expect(refresh).toHaveBeenCalledOnce();
    });

    test('treats a token without a username as logged out and clears the cookies', async () => {
        values.set('access_token', signToken({ name: 'No Username' }, 300));
        values.set('refresh_token', 'refresh-token');

        const session = await runMiddleware();

        expect(session).toEqual({ isLoggedIn: false });
        expect(values.has('access_token')).toBe(false);
        expect(values.has('refresh_token')).toBe(false);
    });

    test('treats a token with an invalid signature as logged out', async () => {
        const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
        values.set(
            'access_token',
            jsonwebtoken.sign(userClaims, otherKey, { algorithm: 'RS256', keyid: 'key-1', expiresIn: 300 }),
        );
        values.set('refresh_token', 'refresh-token');

        const session = await runMiddleware();

        expect(session).toEqual({ isLoggedIn: false });
        expect(userinfo).not.toHaveBeenCalled();
    });
});
