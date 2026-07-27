import type { APIContext, AstroCookies } from 'astro';
import type { BaseClient } from 'openid-client';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../config.ts', () => ({
    getConfiguredOrganisms: () => [],
    getRuntimeConfig: () => ({
        insecureCookies: false,
        oidcTransactionCookieSecret: 'test-oidc-transaction-cookie-secret',
    }),
    getWebsiteConfig: () => ({ readOnlyMode: false }),
}));

import { getTokenFromParams } from './authMiddleware.ts';
import { addAuthRequest } from '../utils/authRequestCookies.ts';

describe('OIDC callback exchange', () => {
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
        /* eslint-disable @typescript-eslint/naming-convention */
        callback.mockResolvedValue({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
        });
        /* eslint-enable @typescript-eslint/naming-convention */
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
});
