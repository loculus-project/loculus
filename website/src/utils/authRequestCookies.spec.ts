import { createCipheriv, createHash, randomBytes } from 'node:crypto';

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
        // Like a browser, reject an oversized replacement and retain the previous cookie.
        set: vi.fn((name: string, value: string) => {
            if (Buffer.byteLength(`${name}=${value}`) <= 4096) {
                values.set(name, value);
            }
        }),
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

    const longReturnTo = (length: number) => 'https://loculus.test/user?query='.padEnd(length, 'x');
    const nonce = 'n'.repeat(43);
    const verifier = 'v'.repeat(43);
    const stateFor = (index: number) => `state-${index}`.padEnd(43, 's');

    function expectCookieWithinBudget() {
        for (const [name, value] of cookieMocks.set.mock.calls) {
            expect(Buffer.byteLength(`${name}=${value}`)).toBeLessThanOrEqual(3800);
        }
    }

    test('evicts older long transactions while preserving the newest full search URL', () => {
        vi.useFakeTimers();
        for (let index = 0; index < 3; index++) {
            addAuthRequest(cookies, stateFor(index), nonce, verifier, longReturnTo(2000));
            vi.advanceTimersByTime(1);
        }

        expectCookieWithinBudget();
        expect(consumeAuthRequest(cookies, stateFor(0))).toBeUndefined();
        expect(consumeAuthRequest(cookies, stateFor(1))).toBeUndefined();
        expect(consumeAuthRequest(cookies, stateFor(2))?.returnTo).toBe(longReturnTo(2000));
    });

    test('falls back to the same-origin account page when one return URL alone is too large', () => {
        addAuthRequest(cookies, stateFor(0), nonce, verifier, longReturnTo(2900));

        expectCookieWithinBudget();
        expect(consumeAuthRequest(cookies, stateFor(0))).toEqual({
            nonce,
            codeVerifier: verifier,
            returnTo: 'https://loculus.test/user',
        });
    });

    test('recovers from a nearly full legacy cookie instead of repeatedly losing the retry state', () => {
        // Build the valid v1 cookie the old implementation could leave in the browser:
        // two abandoned long-URL attempts, each still valid for nearly an hour.
        const legacyStore = Object.fromEntries(
            [0, 1].map((index) => [
                stateFor(index),
                { nonce, codeVerifier: verifier, returnTo: longReturnTo(1280), expiresAt: Date.now() + 3599000 },
            ]),
        );
        const iv = randomBytes(12);
        const key = createHash('sha256').update('test-oidc-transaction-cookie-secret').digest();
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(legacyStore)), cipher.final()]);
        const legacyCookie = [
            'v1',
            iv.toString('base64url'),
            ciphertext.toString('base64url'),
            cipher.getAuthTag().toString('base64url'),
        ].join('.');
        expect(Buffer.byteLength(`${AUTH_TRANSACTIONS_COOKIE}=${legacyCookie}`)).toBeGreaterThan(3800);
        expect(Buffer.byteLength(`${AUTH_TRANSACTIONS_COOKIE}=${legacyCookie}`)).toBeLessThan(4096);
        values.set(AUTH_TRANSACTIONS_COOKIE, legacyCookie);

        for (let index = 2; index < 5; index++) {
            addAuthRequest(cookies, stateFor(index), nonce, verifier, 'https://loculus.test/user');
            expect(consumeAuthRequest(cookies, stateFor(index))?.returnTo).toBe('https://loculus.test/user');
        }
        expectCookieWithinBudget();
    });

    test.each([0, -1000])('keeps the newly added state when the clock changes by %s ms', (clockChange) => {
        vi.useFakeTimers();
        vi.setSystemTime('2026-07-24T00:00:00Z');
        for (let index = 0; index < 3; index++) {
            addAuthRequest(cookies, stateFor(index), nonce, verifier, 'https://loculus.test/user');
        }
        vi.setSystemTime(Date.now() + clockChange);
        addAuthRequest(cookies, stateFor(3), nonce, verifier, 'https://loculus.test/user');

        expect(consumeAuthRequest(cookies, stateFor(3))).toBeDefined();
        expectCookieWithinBudget();
    });

    test.each([4, 8, 12, 13, 14, 15])(
        'rejects a cookie whose authentication tag is truncated to %s bytes',
        (length) => {
            addAuthRequest(cookies, 'state', nonce, verifier, 'https://loculus.test/user');
            const parts = values.get(AUTH_TRANSACTIONS_COOKIE)!.split('.');
            parts[3] = Buffer.from(parts[3], 'base64url').subarray(0, length).toString('base64url');
            values.set(AUTH_TRANSACTIONS_COOKIE, parts.join('.'));

            expect(consumeAuthRequest(cookies, 'state')).toBeUndefined();
        },
    );

    test('rejects modified ciphertext even when the authentication tag has the correct length', () => {
        addAuthRequest(cookies, 'state', nonce, verifier, 'https://loculus.test/user');
        const parts = values.get(AUTH_TRANSACTIONS_COOKIE)!.split('.');
        const ciphertext = Buffer.from(parts[2], 'base64url');
        ciphertext[0] ^= 1;
        parts[2] = ciphertext.toString('base64url');
        values.set(AUTH_TRANSACTIONS_COOKIE, parts.join('.'));

        expect(consumeAuthRequest(cookies, 'state')).toBeUndefined();
    });

    test('rejects an unexpected IV length', () => {
        // GCM supports other IV lengths, but the v1 cookie format uses exactly 12 bytes.
        // A valid tag with a different IV length must not bypass that format restriction.
        const iv = randomBytes(16);
        const key = createHash('sha256').update('test-oidc-transaction-cookie-secret').digest();
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        const store = {
            state: {
                nonce,
                codeVerifier: verifier,
                returnTo: 'https://loculus.test/user',
                expiresAt: Date.now() + 60000,
            },
        };
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(store)), cipher.final()]);
        values.set(
            AUTH_TRANSACTIONS_COOKIE,
            [
                'v1',
                iv.toString('base64url'),
                ciphertext.toString('base64url'),
                cipher.getAuthTag().toString('base64url'),
            ].join('.'),
        );

        expect(consumeAuthRequest(cookies, 'state')).toBeUndefined();
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
