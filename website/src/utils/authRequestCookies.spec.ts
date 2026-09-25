import type { AstroCookies } from 'astro';
import { generators } from 'openid-client';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
    LEGACY_AUTH_TRANSACTIONS_COOKIE,
    addAuthRequest,
    authTransactionCookieName,
    authTransactionId,
    consumeAuthRequest,
} from './authRequestCookies.ts';
// Astro has no public export of AstroCookies. The real class is used so that the tests see the
// Set-Cookie attributes, the path in particular, that a browser would receive.
import { AstroCookies as RealAstroCookies } from '../../node_modules/astro/dist/core/cookies/index.js';

vi.mock('../config.ts', () => ({
    getRuntimeConfig: () => ({
        insecureCookies: false,
        oidcTransactionCookieSecret: 'test-oidc-transaction-cookie-secret',
    }),
}));

type StoredCookie = { value: string; path: string };

/** A minimal browser cookie jar: honours Path and deletion, ignores Max-Age like a clock-skewed client. */
class Browser {
    readonly jar = new Map<string, StoredCookie>();
    readonly setCookieHeaders: string[] = [];

    request(path: string): AstroCookies {
        const cookieHeader = [...this.jar.entries()]
            .filter(([, cookie]) => path === cookie.path || path.startsWith(`${cookie.path}/`) || cookie.path === '/')
            .map(([name, cookie]) => `${name}=${cookie.value}`)
            .join('; ');
        // happy-dom's Request drops the forbidden Cookie header, so hand AstroCookies a plain Headers object.
        const request = { headers: new Headers({ cookie: cookieHeader }) } as unknown as Request;
        return new RealAstroCookies(request, { warn: vi.fn() });
    }

    receive(cookies: AstroCookies) {
        for (const header of cookies.headers()) {
            this.setCookieHeaders.push(header);
            const [nameValue, ...attributes] = header.split('; ');
            const separator = nameValue.indexOf('=');
            const name = nameValue.slice(0, separator);
            const value = nameValue.slice(separator + 1);
            const path = attributes.find((it) => it.startsWith('Path='))?.slice('Path='.length) ?? '/';
            const expires = attributes.find((it) => it.startsWith('Expires='));
            if (expires !== undefined && new Date(expires.slice('Expires='.length)).getTime() < Date.now()) {
                this.jar.delete(name);
            } else {
                this.jar.set(name, { value, path });
            }
        }
    }

    login(state: string, returnTo = `https://loculus.test/${state.slice(0, 4)}`) {
        const cookies = this.request('/auth/login');
        addAuthRequest(cookies, state, `nonce-${state}`, `verifier-${state}`, returnTo);
        this.receive(cookies);
    }

    callback(state: unknown) {
        const cookies = this.request('/auth/callback');
        const result = consumeAuthRequest(cookies, state);
        this.receive(cookies);
        return result;
    }
}

const expected = (state: string) => ({
    state,
    nonce: `nonce-${state}`,
    codeVerifier: `verifier-${state}`,
    returnTo: `https://loculus.test/${state.slice(0, 4)}`,
});

describe('OIDC authentication transaction cookies', () => {
    let browser: Browser;
    const stateOne = generators.state();
    const stateTwo = generators.state();

    beforeEach(() => {
        browser = new Browser();
        vi.useRealTimers();
    });

    test('writes one sealed cookie per login, scoped to the callback path', () => {
        browser.login(stateOne);

        expect([...browser.jar.keys()]).toEqual([authTransactionCookieName(stateOne)]);
        expect(browser.setCookieHeaders).toHaveLength(1);
        const header = browser.setCookieHeaders[0];
        expect(header).toMatch(new RegExp(`^oidc_tx_${stateOne}=v1\\.`));
        for (const attribute of ['Path=/auth/callback', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=3600']) {
            expect(header.split('; ')).toContain(attribute);
        }
        expect(header).not.toContain(`nonce-${stateOne}`);
        expect(header.length).toBeLessThan(1024);
    });

    test('sends the cookie only to the callback', () => {
        browser.login(stateOne);

        expect(browser.request('/').has(authTransactionCookieName(stateOne))).toBe(false);
        expect(browser.request('/auth/login').has(authTransactionCookieName(stateOne))).toBe(false);
        expect(browser.request('/auth/callback').has(authTransactionCookieName(stateOne))).toBe(true);
    });

    test('completes two concurrent logins independently, each exactly once', () => {
        browser.login(stateOne);
        browser.login(stateTwo);

        expect(browser.callback(stateTwo)).toEqual(expected(stateTwo));
        expect(browser.callback(stateOne)).toEqual(expected(stateOne));
        expect(browser.jar.size).toBe(0);
        expect(browser.setCookieHeaders.at(-1)).toContain('Path=/auth/callback');
    });

    test('rejects a replayed callback', () => {
        browser.login(stateOne);

        expect(browser.callback(stateOne)).toEqual(expected(stateOne));
        expect(browser.callback(stateOne)).toBeUndefined();
    });

    test('rejects an expired transaction even if the browser still sends the cookie', () => {
        vi.useFakeTimers();
        vi.setSystemTime('2026-07-24T00:00:00Z');
        browser.login(stateOne);
        vi.advanceTimersByTime(60 * 60 * 1000 + 1);

        expect(browser.callback(stateOne)).toBeUndefined();
        expect(browser.jar.size).toBe(0);
    });

    test('rejects and deletes a tampered cookie', () => {
        browser.login(stateOne);
        const cookie = browser.jar.get(authTransactionCookieName(stateOne))!;
        const [version, iv, ciphertext, tag] = cookie.value.split('.');
        const flipped = (ciphertext.startsWith('A') ? 'B' : 'A') + ciphertext.slice(1);
        cookie.value = [version, iv, flipped, tag].join('.');

        expect(browser.callback(stateOne)).toBeUndefined();
        expect(browser.jar.size).toBe(0);
    });

    test('rejects a cookie whose embedded state does not match its name', () => {
        browser.login(stateOne);
        browser.login(stateTwo);
        browser.jar.get(authTransactionCookieName(stateTwo))!.value = browser.jar.get(
            authTransactionCookieName(stateOne),
        )!.value;

        expect(browser.callback(stateTwo)).toBeUndefined();
        expect(browser.callback(stateOne)).toEqual(expected(stateOne));
    });

    test.each([
        'constructor',
        '__proto__',
        'toString',
        'hasOwnProperty',
        'valueOf',
        '',
        'x'.repeat(42),
        'x'.repeat(44),
        `${'x'.repeat(42)}=`,
        `${'x'.repeat(42)};`,
        undefined,
        null,
        42,
        {},
        ['a'.repeat(43), 'b'.repeat(43)],
    ])('rejects the malformed state %j without reading or writing cookies', (state) => {
        browser.login(stateOne);
        const cookies = browser.request('/auth/callback');
        const get = vi.spyOn(cookies, 'get');

        expect(() => consumeAuthRequest(cookies, state)).not.toThrow();
        expect(consumeAuthRequest(cookies, state)).toBeUndefined();
        expect(get).not.toHaveBeenCalled();
        expect([...cookies.headers()]).toEqual([]);
        expect(() => authTransactionId(state)).not.toThrow();
    });

    test('removes the cookie written by the previous single-store design, and only when present', () => {
        browser.login(stateOne);
        expect(browser.setCookieHeaders).toHaveLength(1);

        browser.jar.set(LEGACY_AUTH_TRANSACTIONS_COOKIE, { value: 'v1.old.store.value', path: '/' });
        browser.login(stateTwo);

        expect(browser.jar.has(LEGACY_AUTH_TRANSACTIONS_COOKIE)).toBe(false);
        const legacyDeletion = browser.setCookieHeaders.find((it) => it.startsWith(LEGACY_AUTH_TRANSACTIONS_COOKIE));
        expect(legacyDeletion).toContain('Path=/');
    });

    test('produces a safe stable correlation identifier without revealing state', () => {
        expect(authTransactionId(stateOne)).toBe(authTransactionId(stateOne));
        expect(authTransactionId(stateOne)).toMatch(/^[a-f0-9]{12}$/);
        expect(authTransactionId(stateOne)).not.toContain(stateOne.slice(0, 12));
        expect(authTransactionId(undefined)).toBe('missing');
        expect(authTransactionId(['a', 'b'])).toBe('invalid');
    });
});
