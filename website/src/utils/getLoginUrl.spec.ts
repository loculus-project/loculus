import { describe, expect, test } from 'vitest';

import { getLoginUrl } from './getLoginUrl.ts';

describe('getLoginUrl', () => {
    const origin = 'https://loculus.test';

    test.each([
        'https://loculus.test/logout',
        'https://loculus.test/logout?source=account-page',
        'https://loculus.test/auth/login-failed',
    ])('returns to the account page after logging in from an authentication exit page', (returnTo) => {
        expect(getLoginUrl(returnTo, origin)).toBe('/auth/login?returnTo=%2Fuser');
    });

    test('preserves an ordinary return destination', () => {
        expect(getLoginUrl('https://loculus.test/cchf/search', origin)).toBe('/auth/login?returnTo=%2Fcchf%2Fsearch');
    });

    test.each([
        '/cchf/search?state=pending&code=sample#results',
        'https://loculus.test/cchf/search?state=pending&code=sample#results',
    ])('preserves the path, query and fragment of %s', (returnTo) => {
        const loginUrl = new URL(getLoginUrl(returnTo, origin), origin);
        expect(loginUrl.searchParams.get('returnTo')).toBe('/cchf/search?state=pending&code=sample#results');
    });

    test.each([
        'https://attacker.test/user',
        '//attacker.test/user',
        'http://loculus.test/user',
        'https://loculus.test:444/user',
        'https://loculus.test@attacker.test/user',
        'javascript:alert(1)',
        'https://[invalid',
    ])('falls back to the account page for an external or malformed destination: %s', (returnTo) => {
        expect(getLoginUrl(returnTo, origin)).toBe('/auth/login?returnTo=%2Fuser');
    });

    test('resolves relative destinations against the supplied local origin', () => {
        expect(getLoginUrl('user?source=local', 'http://localhost:3000')).toBe(
            '/auth/login?returnTo=%2Fuser%3Fsource%3Dlocal',
        );
    });

    test('does not turn a same-origin double-slash path into an external destination', () => {
        const returnTo = 'https://loculus.test//attacker.test/path';
        const loginUrl = new URL(getLoginUrl(returnTo, origin), origin);
        const destination = new URL(loginUrl.searchParams.get('returnTo')!, origin);
        expect(destination.toString()).toBe(returnTo);
        expect(destination.origin).toBe(origin);
    });
});
