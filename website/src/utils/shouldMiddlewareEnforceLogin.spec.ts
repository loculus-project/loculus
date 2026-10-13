import { describe, expect, test } from 'vitest';

import { isLapisDataRoute, shouldMiddlewareEnforceLogin } from './shouldMiddlewareEnforceLogin';
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

describe('isLapisDataRoute', () => {
    test('should return true for all LAPIS-data-serving routes', () => {
        expectIsDataRoute('/');
        expectIsDataRoute(`/${testOrganism}/search`);
        expectIsDataRoute(`/${testOrganism}/search?query=1`);
        expectIsDataRoute(`/${testOrganism}/submission/123/released`);
        expectIsDataRoute(routes.sequenceEntryDetailsPage('LOC_000001Y.1'));
        expectIsDataRoute('/seq/LOC_000001Y.1.fa');
        expectIsDataRoute('/seq/LOC_000001Y.1/versions');
        expectIsDataRoute('/seqsets/1.1');
        expectIsDataRoute('/group/123');
    });

    test('should return false for non-data routes', () => {
        expectIsNoDataRoute('/user');
        expectIsNoDataRoute('/docs');
        expectIsNoDataRoute('/api-documentation');
        expectIsNoDataRoute('/api/lapis');
        expectIsNoDataRoute(`/${testOrganism}/submission/123`);
        expectIsNoDataRoute('/unconfigured-organism/search');
    });

    function expectIsDataRoute(path: string) {
        expect(isLapisDataRoute(path, configuredOrganisms), path).toBe(true);
    }

    function expectIsNoDataRoute(path: string) {
        expect(isLapisDataRoute(path, configuredOrganisms), path).toBe(false);
    }
});
