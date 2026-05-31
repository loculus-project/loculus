import jsonwebtoken from 'jsonwebtoken';
import { describe, expect, test } from 'vitest';

import { extractRealmRoles } from './extractRealmRoles.ts';

/* eslint-disable @typescript-eslint/naming-convention -- Keycloak JWT claim names use snake_case. */
function signTestToken(payload: Record<string, unknown>): string {
    return jsonwebtoken.sign(payload, 'test-secret', { algorithm: 'HS256' });
}

describe('extractRealmRoles', () => {
    test('returns realm_access.roles when present', () => {
        const token = signTestToken({ realm_access: { roles: ['user', 'super_user'] } });
        expect(extractRealmRoles(token)).toEqual(['user', 'super_user']);
    });

    test('returns [] when realm_access is missing', () => {
        const token = signTestToken({ preferred_username: 'alice' });
        expect(extractRealmRoles(token)).toEqual([]);
    });

    test('returns [] when realm_access.roles is missing', () => {
        const token = signTestToken({ realm_access: {} });
        expect(extractRealmRoles(token)).toEqual([]);
    });

    test('drops non-string entries', () => {
        const token = signTestToken({ realm_access: { roles: ['user', 42, null, 'super_user'] } });
        expect(extractRealmRoles(token)).toEqual(['user', 'super_user']);
    });

    test('returns [] for an unparseable token (never escalates to admin)', () => {
        expect(extractRealmRoles('not-a-jwt')).toEqual([]);
        expect(extractRealmRoles('')).toEqual([]);
    });
});
