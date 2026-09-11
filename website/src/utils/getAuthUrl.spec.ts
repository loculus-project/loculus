import { describe, expect, test } from 'vitest';

import { getLoginUrl } from './getAuthUrl.ts';

describe('getLoginUrl', () => {
    test.each([
        'https://loculus.test/logout',
        'https://loculus.test/logout?source=account-page',
        'https://loculus.test/auth/login-failed',
    ])('returns to the account page after logging in from an authentication exit page', (returnTo) => {
        expect(getLoginUrl(returnTo)).toBe('/auth/login?returnTo=%2Fuser');
    });

    test('preserves an ordinary return destination', () => {
        expect(getLoginUrl('https://loculus.test/cchf/search')).toBe(
            '/auth/login?returnTo=https%3A%2F%2Floculus.test%2Fcchf%2Fsearch',
        );
    });
});
