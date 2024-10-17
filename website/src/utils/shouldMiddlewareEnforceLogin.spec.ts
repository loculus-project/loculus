import { describe, expect, test } from 'vitest';

import { shouldMiddlewareEnforceLogin } from './shouldMiddlewareEnforceLogin';
import { testOrganism } from '../../vitest.setup.ts';
import { routes } from '../routes/routes.ts';

const otherOrganism = 'otherOrganism';
const configuredOrganisms = [testOrganism, otherOrganism];

describe('shouldMiddlewareEnforceLogin', () => {
    test('should return false if not specified', () => {
        expectNoLogin('/someRoute');
    });

    test('should return false for empty string', () => {
        expectNoLogin('');
    });

    test('should return true on routes which should force login', () => {
        expectForceLogin('/user');
        expectForceLogin('/user/someUsername');
    });

    test('should return false for various public routes', () => {
        expectNoLogin(`/${testOrganism}/search`);
        expectNoLogin(`/`);
        expectNoLogin(`/${testOrganism}`);
        expectNoLogin(routes.sequenceEntryDetailsPage('id_002156'));
    });

    function expectForceLogin(path: string) {
        expect(shouldMiddlewareEnforceLogin(path, configuredOrganisms), path).toBe(true);
    }

    function expectNoLogin(path: string) {
        expect(shouldMiddlewareEnforceLogin(path, configuredOrganisms), path).toBe(false);
    }
});
