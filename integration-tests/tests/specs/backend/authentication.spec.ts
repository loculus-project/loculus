import { APIRequestContext, expect } from '@playwright/test';

import { test as consoleWarningsTest } from '../../fixtures/console-warnings.fixture';
import { createServiceRequestContext, getBackendBaseUrl } from '../../utils/dataAuthentication';

const test = consoleWarningsTest.extend<{ backendRequest: APIRequestContext }>({
    backendRequest: async ({}, use) => {
        const requestContext = await createServiceRequestContext(getBackendBaseUrl());
        await use(requestContext);
        await requestContext.dispose();
    },
});

const tokenSignedWithDifferentKey =
    'eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjE3MDE0MjMyNzAsImlhdCI6MTcwMTMzNjg3MCwicHJlZmVycmVkX3VzZXJuYW1lIjoidGVzdFVzZXIifQ' +
    '.FMVL2JLVV3VloGMXpinviq-37GU11OiuTh70VwAlWH2pnRfpGs1SeSWsvQm9dbr67UwbJfiHrTuprk5VeENkzPcnZ7FlY8XPLdmewsu7-pG2BZ' +
    'sXhBlz_gruqx5HmIIaufXHk8zbyZomxciwp-vUx6uvh4q5gGVQxGwh5H3wz3dVinFn6k8gFIL3i7ltV9ACO0tSJxPA1E_lx5kmQmnztWkWakrzG' +
    '3b2K726UGDI8eO18Oezi1TCSPZnCLhiPY0-kgqhi42ASW4EwEGFsD-jPqInrSlaRwKitSe_QbKOJz1afQnwRxXwf1IbtzJZ3UF4td1KcnR-qtyo' +
    'kxJWFxJ4-w';

test.describe('Backend authentication', () => {
    test('rejects tokens that were not signed by Keycloak', async ({ backendRequest }) => {
        const response = await backendRequest.get('/dummy-organism/get-data-to-edit/1/1', {
            headers: {
                Authorization: `Bearer ${tokenSignedWithDifferentKey}`,
            },
        });

        expect(response.status()).toBe(401);

        const wwwAuthenticateHeader = response.headers()['www-authenticate'];
        expect(wwwAuthenticateHeader).toBeDefined();
        expect(wwwAuthenticateHeader).toContain('Invalid signature');
    });
});
