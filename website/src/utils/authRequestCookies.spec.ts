import type { AstroCookies } from 'astro';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
    AUTH_TRANSACTIONS_COOKIE,
    addAuthRequest,
    authTransactionId,
    consumeAuthRequest,
} from './authRequestCookies.ts';

vi.mock('../config.ts', () => ({
    getRuntimeConfig: () => ({
        insecureCookies: false,
        oidcTransactionCookieSecret: 'test-oidc-transaction-cookie-secret',
    }),
}));

describe('OIDC authentication transaction store', () => {
    const prototypeStates = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];
    const values = new Map<string, string>();
    const cookieMocks = {
        get: vi.fn((name: string) => {
            const value = values.get(name);
            return value === undefined ? undefined : { value };
        }),
        set: vi.fn((name: string, value: string) => values.set(name, value)),
        delete: vi.fn((name: string) => values.delete(name)),
    };
    const cookies = cookieMocks as unknown as AstroCookies;

    beforeEach(() => {
        values.clear();
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    test('stores multiple transactions and consumes only the selected state', () => {
        addAuthRequest(cookies, 'state-one', 'nonce-one', 'verifier-one', 'https://loculus.test/one');
        addAuthRequest(cookies, 'state-two', 'nonce-two', 'verifier-two', 'https://loculus.test/two');

        expect(values.get(AUTH_TRANSACTIONS_COOKIE)).not.toContain('nonce-one');
        expect(consumeAuthRequest(cookies, 'state-one')).toEqual({
            nonce: 'nonce-one',
            codeVerifier: 'verifier-one',
            returnTo: 'https://loculus.test/one',
        });
        expect(consumeAuthRequest(cookies, 'state-one')).toBeUndefined();
        expect(consumeAuthRequest(cookies, 'state-two')).toEqual({
            nonce: 'nonce-two',
            codeVerifier: 'verifier-two',
            returnTo: 'https://loculus.test/two',
        });
        expect(values.has(AUTH_TRANSACTIONS_COOKIE)).toBe(false);
    });

    test('does not read or modify the transaction cookie when state is missing', () => {
        addAuthRequest(cookies, 'pending-state', 'nonce', 'verifier', 'https://loculus.test/user');
        const originalCookie = values.get(AUTH_TRANSACTIONS_COOKIE);
        vi.clearAllMocks();

        expect(consumeAuthRequest(cookies, undefined)).toBeUndefined();

        expect(cookieMocks.get).not.toHaveBeenCalled();
        expect(cookieMocks.set).not.toHaveBeenCalled();
        expect(cookieMocks.delete).not.toHaveBeenCalled();
        expect(values.get(AUTH_TRANSACTIONS_COOKIE)).toBe(originalCookie);
        expect(consumeAuthRequest(cookies, 'pending-state')).toEqual({
            nonce: 'nonce',
            codeVerifier: 'verifier',
            returnTo: 'https://loculus.test/user',
        });
    });

    test('retains only the three newest transactions', () => {
        vi.useFakeTimers();
        vi.setSystemTime('2026-07-24T00:00:00Z');
        for (const state of ['one', 'two', 'three', 'four']) {
            addAuthRequest(cookies, state, `nonce-${state}`, `verifier-${state}`, `https://loculus.test/${state}`);
            vi.advanceTimersByTime(1);
        }

        expect(consumeAuthRequest(cookies, 'one')).toBeUndefined();
        expect(consumeAuthRequest(cookies, 'two')).toBeDefined();
        expect(consumeAuthRequest(cookies, 'three')).toBeDefined();
        expect(consumeAuthRequest(cookies, 'four')).toBeDefined();
    });

    test('rejects expired and modified stores', () => {
        vi.useFakeTimers();
        vi.setSystemTime('2026-07-24T00:00:00Z');
        addAuthRequest(cookies, 'state', 'nonce', 'verifier', 'https://loculus.test/state');
        vi.advanceTimersByTime(60 * 60 * 1000 + 1);
        expect(consumeAuthRequest(cookies, 'state')).toBeUndefined();

        addAuthRequest(cookies, 'other-state', 'other-nonce', 'other-verifier', 'https://loculus.test/other-state');
        values.set(AUTH_TRANSACTIONS_COOKIE, `${values.get(AUTH_TRANSACTIONS_COOKIE)}modified`);
        expect(consumeAuthRequest(cookies, 'other-state')).toBeUndefined();
    });

    test.each(prototypeStates)('rejects the prototype-chain state %s that was never issued', (state) => {
        expect(consumeAuthRequest(cookies, state)).toBeUndefined();
    });

    test.each(prototypeStates)(
        'the prototype-chain state %s does not consume or clobber a real transaction',
        (state) => {
            addAuthRequest(cookies, 'real-state', 'nonce', 'verifier', 'https://loculus.test/real');

            expect(consumeAuthRequest(cookies, state)).toBeUndefined();
            expect(consumeAuthRequest(cookies, 'real-state')).toEqual({
                nonce: 'nonce',
                codeVerifier: 'verifier',
                returnTo: 'https://loculus.test/real',
            });
        },
    );

    test.each(prototypeStates)('round-trips an explicitly stored %s key as an ordinary transaction', (state) => {
        // Production states are random. These keys exercise dictionary semantics, including __proto__ assignment.
        addAuthRequest(cookies, state, 'nonce', 'verifier', 'https://loculus.test/user');

        expect(consumeAuthRequest(cookies, state)).toEqual({
            nonce: 'nonce',
            codeVerifier: 'verifier',
            returnTo: 'https://loculus.test/user',
        });
        expect(consumeAuthRequest(cookies, state)).toBeUndefined();
    });

    test('produces a safe stable correlation identifier without revealing state', () => {
        expect(authTransactionId('secret-state')).toBe(authTransactionId('secret-state'));
        expect(authTransactionId('secret-state')).not.toContain('secret-state');
        expect(authTransactionId(undefined)).toBe('missing');
    });
});
