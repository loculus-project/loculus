import { describe, expect, test } from 'vitest';

import { shouldMiddlewareEnforceLogin } from './shouldMiddlewareEnforceLogin';
import { testOrganism } from '../../vitest.setup.ts';
import { routes } from '../routes/routes.ts';

const otherOrganism = 'otherOrganism';
const configuredOrganisms = [testOrganism, otherOrganism];

describe('shouldMiddlewareEnforceLogin', () => {
    describe('without requireAuthenticationForData', () => {
        const options = { requireAuthenticationForData: false, hasBearerToken: false };

        test('should return false if not specified', () => {
            expectNoLogin('/someRoute', options);
        });

        test('should return false for empty string', () => {
            expectNoLogin('', options);
        });

        test('should return true on routes which should force login', () => {
            expectForceLogin('/user', options);
            expectForceLogin('/user/someUsername', options);
        });

        test('should return false for various public routes', () => {
            expectNoLogin(`/${testOrganism}/search`, options);
            expectNoLogin(`/`, options);
            expectNoLogin(`/${testOrganism}`, options);
            expectNoLogin(routes.sequenceEntryDetailsPage('id_002156'), options);
            expectNoLogin('/seqsets/1.1', options);
            expectNoLogin('/group/123', options);
        });
    });

    describe('with requireAuthenticationForData', () => {
        const options = { requireAuthenticationForData: true, hasBearerToken: false };

        test('should return true on routes which always force login', () => {
            expectForceLogin('/user', options);
            expectForceLogin('/user/someUsername', options);
        });

        test('should return true for pages that show released data', () => {
            expectForceLogin(`/${testOrganism}/search`, options);
            expectForceLogin(`/${testOrganism}/search?query=1`, options);
            expectForceLogin(`/${testOrganism}/submission/123/released`, options);
            expectForceLogin(routes.sequenceEntryDetailsPage('LOC_000001Y.1'), options);
            expectForceLogin('/seq/LOC_000001Y.1.fa', options);
            expectForceLogin('/seq/LOC_000001Y.1/versions', options);
            expectForceLogin('/seqsets/1.1', options);
            expectForceLogin('/group/123', options);
        });

        test('should return false for pages without released data', () => {
            expectNoLogin('/', options);
            expectNoLogin('/docs', options);
            expectNoLogin('/api-documentation', options);
            expectNoLogin('/auth/callback', options);
            expectNoLogin(`/${testOrganism}/submission/123`, options);
            expectNoLogin('/unconfiguredOrganism/search', options);
        });

        test('should return false for file links, which answer with 401 themselves', () => {
            expectNoLogin('/seq/LOC_000001Y.1/annotations/LOC_000001Y.1.embl', options);
            expectNoLogin('/seq/LOC_000001Y.1/rawReads/reads.fastq.gz', options);
        });

        test('should return true for per-sequence downloads without a Bearer token', () => {
            expectForceLogin('/seq/LOC_000001Y.1.fa', options);
            expectForceLogin('/seq/LOC_000001Y.1.tsv', options);
            expectForceLogin('/seq/LOC_000001Y.1/details.json', options);
        });

        test('should return false for per-sequence downloads with a Bearer token', () => {
            const withBearerToken = { requireAuthenticationForData: true, hasBearerToken: true };
            expectNoLogin('/seq/LOC_000001Y.1.fa', withBearerToken);
            expectNoLogin('/seq/LOC_000001Y.1.tsv', withBearerToken);
            expectNoLogin('/seq/LOC_000001Y.1/details.json', withBearerToken);
        });

        test('should still return true for the sequence HTML page with a Bearer token', () => {
            expectForceLogin('/seq/LOC_000001Y.1', { requireAuthenticationForData: true, hasBearerToken: true });
            expectForceLogin('/seq/LOC_000001Y.1/versions', {
                requireAuthenticationForData: true,
                hasBearerToken: true,
            });
        });
    });

    function expectForceLogin(
        path: string,
        options: { requireAuthenticationForData: boolean; hasBearerToken: boolean },
    ) {
        expect(shouldMiddlewareEnforceLogin(path, configuredOrganisms, options), path).toBe(true);
    }

    function expectNoLogin(path: string, options: { requireAuthenticationForData: boolean; hasBearerToken: boolean }) {
        expect(shouldMiddlewareEnforceLogin(path, configuredOrganisms, options), path).toBe(false);
    }
});
