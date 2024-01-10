import { describe, expect, test } from 'vitest';

import { shouldMiddlewareEnforceLogin } from './shouldMiddlewareEnforceLogin';
import { testOrganism } from '../../vitest.setup.ts';

const otherOrganism = 'otherOrganism';
const configuredOrganisms = [testOrganism, otherOrganism];

describe('shouldMiddlewareEnforceLogin', () => {
    test('should return false if not specified', () => {
        expect(shouldMiddlewareEnforceLogin('/someRoute', [])).toBe(false);
    });

    test('should return false for empty string', () => {
        expect(shouldMiddlewareEnforceLogin('', [])).toBe(false);
    });

    test('should return false for various public routes route', () => {
        expect(`/${testOrganism}/search`).toBe(false);
        expect('/').toBe(false);
        expect(`/${testOrganism}`).toBe(false);
        expect(`/${testOrganism}/sequences/id_002156`).toBe(false);
        expect(`/${testOrganism}/sequences/id_002156`).toBe(false);
        expect(`/${otherOrganism}/sequences/id_002156`).toBe(false);
    });

    test('should return true on routes which should force login', () => {
        expectForceLogin(isPublicRoute('/user', configuredOrganisms))
        expectForceLogin(isPublicRoute('/user/someUsername', configuredOrganisms));
        expectForceLogin(isPublicRoute(`/${testOrganism}/revise`, configuredOrganisms));
        expectForceLogin(isPublicRoute(`/${testOrganism}/submit`, configuredOrganisms));
    });

    function expectForceLogin(path: string) {
        expect(shouldMiddlewareEnforceLogin(path, configuredOrganisms), path).toBe(true);
    }
});
