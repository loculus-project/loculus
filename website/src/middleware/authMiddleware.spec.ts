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
        expect(response.headers.get('location')).toBe(
            'https://loculus.test/auth/login?returnTo=https%3A%2F%2Floculus.test%2Fuser',
        );
        expect(next).not.toHaveBeenCalled();
    });

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
