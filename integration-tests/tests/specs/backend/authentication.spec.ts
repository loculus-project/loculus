import { APIRequestContext, expect, request as playwrightRequest } from '@playwright/test';

import { test as consoleWarningsTest } from '../../fixtures/console-warnings.fixture';

const test = consoleWarningsTest.extend<{ backendRequest: APIRequestContext }>({
    backendRequest: async ({}, use) => {
        const backendBaseUrl = getBackendBaseUrl();

        const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
        const ignoreHTTPSErrors = process.env.PLAYWRIGHT_TEST_IGNORE_HTTPS_ERRORS === 'true';

        const requestContext = await playwrightRequest.newContext({
            baseURL: backendBaseUrl.origin,
            ignoreHTTPSErrors,
            proxy: proxyUrl ? { server: proxyUrl } : undefined,
        });

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

function getBackendBaseUrl(): URL {
    const configuredBackendUrl = process.env.PLAYWRIGHT_TEST_BACKEND_URL;
    if (configuredBackendUrl !== undefined && configuredBackendUrl !== '') {
        return new URL(configuredBackendUrl);
    }

    const baseUrl = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000');

    const hostname = baseUrl.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        const protocol = baseUrl.protocol === 'https:' ? 'https:' : 'http:';
        return new URL(`${protocol}//localhost:8079`);
    }

    const backendHostname = hostname.startsWith('backend') ? hostname : `backend-${hostname}`;
    return new URL(`${baseUrl.protocol}//${backendHostname}`);
}

test.describe('Backend authentication', () => {
    test('rejects tokens that were not signed by Keycloak', async ({ backendRequest }) => {
        const response = await backendRequest.get('/ebola-sudan/get-data-to-edit/1/1', {
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
