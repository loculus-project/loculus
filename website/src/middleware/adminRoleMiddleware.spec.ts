import { describe, expect, test } from 'vitest';

import { isAdminPath, isSessionAuthorizedForAdmin, LOCULUS_ADMINISTRATOR_ROLE } from './adminRoleMiddleware.ts';

describe('isAdminPath', () => {
    test.each([
        ['/admin', true],
        ['/admin/', true],
        ['/admin/config', true],
        ['/admin/config/organisms', true],
        ['/admin/config/organisms/lassa', true],
        ['/admin/logs.txt', false],
        ['/', false],
        ['/admin-not-really', false],
        ['/foo/admin', false],
        ['', false],
    ])('isAdminPath(%j) === %s', (input, expected) => {
        expect(isAdminPath(input)).toBe(expected);
    });
});

describe('isSessionAuthorizedForAdmin', () => {
    test('returns false when session is missing', () => {
        expect(isSessionAuthorizedForAdmin(undefined)).toBe(false);
    });

    test('returns false for anonymous session', () => {
        expect(isSessionAuthorizedForAdmin({ isLoggedIn: false, roles: [] })).toBe(false);
    });

    test('returns false for logged-in user without the loculus_administrator role', () => {
        expect(isSessionAuthorizedForAdmin({ isLoggedIn: true, roles: ['user', 'submitter', 'super_user'] })).toBe(
            false,
        );
    });

    test('returns true only when the session is logged in AND has loculus_administrator', () => {
        expect(
            isSessionAuthorizedForAdmin({
                isLoggedIn: true,
                roles: ['user', LOCULUS_ADMINISTRATOR_ROLE],
            }),
        ).toBe(true);
    });

    test('rejects a session whose token claims loculus_administrator but is not logged in (defence-in-depth)', () => {
        expect(isSessionAuthorizedForAdmin({ isLoggedIn: false, roles: [LOCULUS_ADMINISTRATOR_ROLE] })).toBe(false);
    });
});
