import { createHash } from 'node:crypto';

import type { AstroCookies } from 'astro';
import { EncryptJWT } from 'jose';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
    AUTH_TRANSACTIONS_COOKIE,
    addAuthRequest,
    authTransactionId,
    consumeAuthRequest,
} from './authRequestCookies.ts';

const secret = 'test-oidc-transaction-cookie-secret';

vi.mock('../config.ts', () => ({
    getRuntimeConfig: () => ({
        insecureCookies: false,
        oidcTransactionCookieSecret: secret,
    }),
}));

function sealWith(key: Uint8Array, expirationTime: string | number, expiresAt = Date.now() + 60_000) {
    return new EncryptJWT({
        transactions: { state: { nonce: 'nonce', codeVerifier: 'verifier', returnTo: '/', expiresAt } },
    })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setExpirationTime(expirationTime)
        .encrypt(key);
}

const sha256 = (value: string) => createHash('sha256').update(value).digest();

describe('OIDC authentication transaction store', () => {
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

    test('stores multiple transactions and consumes only the selected state', async () => {
        await addAuthRequest(cookies, 'state-one', 'nonce-one', 'verifier-one', 'https://loculus.test/one');
        await addAuthRequest(cookies, 'state-two', 'nonce-two', 'verifier-two', 'https://loculus.test/two');

        expect(values.get(AUTH_TRANSACTIONS_COOKIE)).not.toContain('nonce-one');
        expect(await consumeAuthRequest(cookies, 'state-one')).toEqual({
            nonce: 'nonce-one',
            codeVerifier: 'verifier-one',
            returnTo: 'https://loculus.test/one',
        });
        expect(await consumeAuthRequest(cookies, 'state-one')).toBeUndefined();
        expect(await consumeAuthRequest(cookies, 'state-two')).toEqual({
            nonce: 'nonce-two',
            codeVerifier: 'verifier-two',
            returnTo: 'https://loculus.test/two',
        });
        expect(values.has(AUTH_TRANSACTIONS_COOKIE)).toBe(false);
    });

    test('does not read or modify the transaction cookie when state is missing', async () => {
        await addAuthRequest(cookies, 'pending-state', 'nonce', 'verifier', 'https://loculus.test/user');
        const originalCookie = values.get(AUTH_TRANSACTIONS_COOKIE);
        vi.clearAllMocks();

        expect(await consumeAuthRequest(cookies, undefined)).toBeUndefined();

        expect(cookieMocks.get).not.toHaveBeenCalled();
        expect(cookieMocks.set).not.toHaveBeenCalled();
        expect(cookieMocks.delete).not.toHaveBeenCalled();
        expect(values.get(AUTH_TRANSACTIONS_COOKIE)).toBe(originalCookie);
        expect(await consumeAuthRequest(cookies, 'pending-state')).toEqual({
            nonce: 'nonce',
            codeVerifier: 'verifier',
            returnTo: 'https://loculus.test/user',
        });
    });

    test('retains only the three newest transactions', async () => {
        vi.useFakeTimers();
        vi.setSystemTime('2026-07-24T00:00:00Z');
        for (const state of ['one', 'two', 'three', 'four']) {
            await addAuthRequest(
                cookies,
                state,
                `nonce-${state}`,
                `verifier-${state}`,
                `https://loculus.test/${state}`,
            );
            vi.advanceTimersByTime(1);
        }

        expect(await consumeAuthRequest(cookies, 'one')).toBeUndefined();
        expect(await consumeAuthRequest(cookies, 'two')).toBeDefined();
        expect(await consumeAuthRequest(cookies, 'three')).toBeDefined();
        expect(await consumeAuthRequest(cookies, 'four')).toBeDefined();
    });

    test('rejects expired and modified stores', async () => {
        vi.useFakeTimers();
        vi.setSystemTime('2026-07-24T00:00:00Z');
        await addAuthRequest(cookies, 'state', 'nonce', 'verifier', 'https://loculus.test/state');
        vi.advanceTimersByTime(60 * 60 * 1000 + 1);
        expect(await consumeAuthRequest(cookies, 'state')).toBeUndefined();

        await addAuthRequest(
            cookies,
            'other-state',
            'other-nonce',
            'other-verifier',
            'https://loculus.test/other-state',
        );
        values.set(AUTH_TRANSACTIONS_COOKIE, `${values.get(AUTH_TRANSACTIONS_COOKIE)}modified`);
        expect(await consumeAuthRequest(cookies, 'other-state')).toBeUndefined();
    });

    test('reads a store sealed with the configured key', async () => {
        values.set(AUTH_TRANSACTIONS_COOKIE, await sealWith(sha256(secret), '1h'));
        expect(await consumeAuthRequest(cookies, 'state')).toBeDefined();
    });

    test('rejects a genuine cookie whose authentication tag was truncated', async () => {
        await addAuthRequest(cookies, 'state', 'nonce', 'verifier', 'https://loculus.test/state');
        const parts = values.get(AUTH_TRANSACTIONS_COOKIE)!.split('.');
        const truncatedTag = Buffer.from(parts[4], 'base64url').subarray(0, 8).toString('base64url');
        values.set(AUTH_TRANSACTIONS_COOKIE, [...parts.slice(0, 4), truncatedTag].join('.'));
        expect(await consumeAuthRequest(cookies, 'state')).toBeUndefined();
    });

    test.each([
        ['garbage', () => Promise.resolve('not-a-jwe')],
        ['the pre-jose v1 format', () => Promise.resolve('v1.aaaa.bbbb.cccc')],
        ['a different key', () => sealWith(sha256('another-secret-of-at-least-32-chars'), '1h')],
        ['an expired token', () => sealWith(sha256(secret), Math.floor(Date.now() / 1000) - 1)],
    ])('treats a cookie sealed with %s as an empty store', async (_, cookieValue) => {
        values.set(AUTH_TRANSACTIONS_COOKIE, await cookieValue());
        expect(await consumeAuthRequest(cookies, 'state')).toBeUndefined();
    });

    test('produces a safe stable correlation identifier without revealing state', () => {
        expect(authTransactionId('secret-state')).toBe(authTransactionId('secret-state'));
        expect(authTransactionId('secret-state')).not.toContain('secret-state');
        expect(authTransactionId(undefined)).toBe('missing');
    });
});
