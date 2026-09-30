import { describe, expect, test } from 'vitest';

import { shouldMiddlewareEnforceLogin } from './shouldMiddlewareEnforceLogin';
import { testOrganism } from '../../vitest.setup.ts';
import { routes } from '../routes/routes.ts';

const otherOrganism = 'otherOrganism';
const configuredOrganisms = [testOrganism, otherOrganism];

describe('shouldMiddlewareEnforceLogin', () => {
    test.each(['/auth/login', '/auth/callback', '/auth/login-failed', '/', '/about', '/logout'])(
        'restricted mode keeps necessary public page %s reachable',
        (path) => {
            expect(shouldMiddlewareEnforceLogin(path, configuredOrganisms, true)).toBe(false);
        },
    );
    test.each(['/lapis/ebola-sudan/sample/details', '/ebola-sudan/search', '/seq/test.fa', '/seqsets', '/group/1'])(
        'restricted mode protects %s',
        (path) => {
            expect(shouldMiddlewareEnforceLogin(path, configuredOrganisms, true)).toBe(true);
        },
    );
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
