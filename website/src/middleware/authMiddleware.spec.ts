import type { APIContext, AstroCookies } from 'astro';
import type { BaseClient } from 'openid-client';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getClient: vi.fn(),
    loggerInfo: vi.fn(),
    shouldMiddlewareEnforceLogin: vi.fn(),
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
        has: vi.fn((name: string) => values.has(name)),
        set: vi.fn((name: string, value: string) => values.set(name, value)),
        delete: vi.fn((name: string) => values.delete(name)),
    } as unknown as AstroCookies;

    const callback = vi.fn();
    // Like openid-client's callbackParams, a repeated parameter becomes an array.
    const callbackParams = vi.fn((url: string) => {
        const searchParams = new URL(url).searchParams;
        const param = (name: string) => {
            const values = searchParams.getAll(name);
            return values.length > 1 ? values : values[0];
        };
        return {
            code: param('code'),
            error: param('error'),
            state: param('state'),
        };
    });
    const expectedState = 'expected-state-00000000000000000000000000000'.slice(0, 43);
    const otherState = 'other-state-0000000000000000000000000000000'.slice(0, 43);
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
            expectedState,
            'expected-nonce',
            'expected-verifier',
            'https://loculus.test/ebola/submission',
        );
        const context = {
            url: new URL(`https://loculus.test/auth/callback?code=authorization-code&state=${expectedState}`),
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
                state: expectedState,
            },
            {
                code_verifier: 'expected-verifier',
                response_type: 'code',
                state: expectedState,
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

    test('consumes the transaction and logs an error response returned by the OIDC provider', async () => {
        addAuthRequest(cookies, expectedState, 'expected-nonce', 'expected-verifier', 'https://loculus.test/user');
        const context = {
            url: new URL(`https://loculus.test/auth/callback?error=access_denied&state=${expectedState}`),
            cookies,
        } as APIContext;

        await expect(getTokenFromParams(context, client)).resolves.toBeUndefined();
        expect(mocks.loggerInfo).toHaveBeenCalledWith(
            expect.stringMatching(
                /^OIDC callback rejected: transactionId=[a-f0-9]{12} reason=provider_error error=access_denied$/,
            ),
        );
        expect(callback).not.toHaveBeenCalled();
        expect(consumeAuthRequest(cookies, expectedState)).toBeUndefined();
    });

    test.each([
        'constructor',
        '__proto__',
        'toString',
        'hasOwnProperty',
        'valueOf',
        `${expectedState}&state=${otherState}`,
        `${expectedState}&state=${expectedState}`,
    ])('rejects the callback state %s without calling the provider or failing', async (state) => {
        addAuthRequest(cookies, expectedState, 'expected-nonce', 'expected-verifier', 'https://loculus.test/user');
        for (const query of [`code=attacker-code&state=${state}`, `error=access_denied&state=${state}`]) {
            const context = {
                url: new URL(`https://loculus.test/auth/callback?${query}`),
                cookies,
            } as APIContext;

            await expect(getTokenFromParams(context, client)).resolves.toBeUndefined();
        }
        expect(callback).not.toHaveBeenCalled();
        expect(mocks.loggerInfo).toHaveBeenCalledWith(
            'OIDC callback rejected: transactionId=invalid reason=missing_or_expired_transaction',
        );
    });
});
