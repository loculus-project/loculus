import { describe, expect, test } from 'vitest';

import { isApiRoute, shouldMiddlewareEnforceLogin } from './shouldMiddlewareEnforceLogin';
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

describe('shouldMiddlewareEnforceLogin on an instance that requires login', () => {
    test('gates the pages that render sequence data', () => {
        expectForceLogin(`/${testOrganism}/search`);
        expectForceLogin(routes.sequenceEntryDetailsPage('id_002156'));
        expectForceLogin('/seqsets');
        // The landing page renders per organism sequence counts
        expectForceLogin('/');
    });

    test('gates the data endpoints', () => {
        expectForceLogin('/lapis/testOrganism/sample/details');
        expectForceLogin('/seq/LOC_0001.1.fa');
        expectForceLogin('/seq/LOC_0001.1/details.json');
    });

    test('keeps the routes needed to log in and to report errors public', () => {
        expectNoLogin('/logout');
        expectNoLogin('/404');
        expectNoLogin('/500');
        expectNoLogin('/503');
        expectNoLogin('/admin/logs.txt');
    });

    test('keeps documentation and instance metadata public', () => {
        expectNoLogin('/docs/concepts/metadataformat');
        expectNoLogin('/api-documentation');
        expectNoLogin('/loculus-info');
    });

    test('still gates what is gated on a public instance', () => {
        expectForceLogin('/user');
        expectForceLogin(`/${testOrganism}/my_sequences`);
    });

    function expectForceLogin(path: string) {
        expect(shouldMiddlewareEnforceLogin(path, configuredOrganisms, true), path).toBe(true);
    }

    function expectNoLogin(path: string) {
        expect(shouldMiddlewareEnforceLogin(path, configuredOrganisms, true), path).toBe(false);
    }
});

describe('isApiRoute', () => {
    test('recognises the endpoints that are fetched by code', () => {
        expect(isApiRoute('/lapis/ebola/sample/details')).toBe(true);
        expect(isApiRoute('/seq/LOC_0001.1.fa')).toBe(true);
        expect(isApiRoute('/seq/LOC_0001.1.tsv')).toBe(true);
        expect(isApiRoute('/seq/LOC_0001.1/details.json')).toBe(true);
    });

    test('does not recognise pages, so that a browser is sent to the login instead of a 401', () => {
        expect(isApiRoute('/seq/LOC_0001.1')).toBe(false);
        expect(isApiRoute('/seq/LOC_0001.1/versions')).toBe(false);
        expect(isApiRoute(`/${testOrganism}/search`)).toBe(false);
        expect(isApiRoute('/')).toBe(false);
    });
});
