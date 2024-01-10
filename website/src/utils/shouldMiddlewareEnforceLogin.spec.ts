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
        expect(shouldMiddlewareEnforceLogin(`/${testOrganism}/search`, configuredOrganisms)).toBe(false);
        expect(shouldMiddlewareEnforceLogin(`/`, configuredOrganisms)).toBe(false);
        expect(shouldMiddlewareEnforceLogin(`/${testOrganism}`, configuredOrganisms)).toBe(false);
        expect(shouldMiddlewareEnforceLogin(`/${testOrganism}/sequences/id_002156`, configuredOrganisms)).toBe(false);
    });

    test('should return true on routes which should force login', () => {
        expectForceLogin('/user');
        expectForceLogin('/user/someUsername');
        expectForceLogin(`/${testOrganism}/revise`);
        expectForceLogin(`/${testOrganism}/submit`);
    });

    function expectForceLogin(path: string) {
        expect(shouldMiddlewareEnforceLogin(path, configuredOrganisms), path).toBe(true);
    }
});
