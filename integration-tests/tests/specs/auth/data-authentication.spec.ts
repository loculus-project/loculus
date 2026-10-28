import { expect, type APIRequestContext } from '@playwright/test';

import { test as base } from '../../fixtures/console-warnings.fixture';
import {
    createServiceRequestContext,
    getBackendBaseUrl,
    getLapisBaseUrl,
    getTestUserTokens,
    skipUnlessAuthenticationForDataIsRequired,
} from '../../utils/dataAuthentication';

const test = base.extend<{ lapisRequest: APIRequestContext; backendRequest: APIRequestContext }>({
    lapisRequest: async ({}, use) => {
        const requestContext = await createServiceRequestContext(getLapisBaseUrl());
        await use(requestContext);
        await requestContext.dispose();
    },
    backendRequest: async ({}, use) => {
        const requestContext = await createServiceRequestContext(getBackendBaseUrl());
        await use(requestContext);
        await requestContext.dispose();
    },
});

async function getAccessToken(request: APIRequestContext) {
    const tokens = await getTestUserTokens(request);
    test.skip(tokens === undefined, 'This deployment has no test accounts');
    return tokens!.accessToken;
}

// A single-segment and a multi-segment organism
const organisms = ['dummy-organism', 'cchf'];

test.describe('Authentication for data on LAPIS', () => {
    for (const organism of organisms) {
        test(`${organism}: rejects requests without a valid token`, async ({ lapisRequest }) => {
            await skipUnlessAuthenticationForDataIsRequired(test, lapisRequest);

            const withoutToken = await lapisRequest.get(`/${organism}/sample/details`);
            expect(withoutToken.status()).toBe(401);
            expect(withoutToken.headers()['www-authenticate']).toContain('Bearer');

            const withMalformedToken = await lapisRequest.get(`/${organism}/sample/details`, {
                headers: { Authorization: 'Bearer not-a-json-web-token' },
            });
            expect(withMalformedToken.status()).toBe(401);
        });

        test(`${organism}: accepts a token of the instance's Keycloak`, async ({
            lapisRequest,
        }) => {
            const accessToken = await getAccessToken(lapisRequest);

            const response = await lapisRequest.get(`/${organism}/sample/details`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            expect(response.status()).toBe(200);
            expect(await response.json()).toHaveProperty('data');
        });
    }

    // The Kubernetes probes and the API documentation links rely on these
    for (const publicPath of ['/actuator/health', '/api-docs', '/swagger-ui/index.html']) {
        test(`serves ${publicPath} without a token`, async ({ lapisRequest }) => {
            const response = await lapisRequest.get(`/dummy-organism${publicPath}`);

            expect(response.status()).toBe(200);
        });
    }
});

test.describe('Authentication for data on the backend', () => {
    test('get-released-data requires a token', async ({ lapisRequest, backendRequest }) => {
        await skipUnlessAuthenticationForDataIsRequired(test, lapisRequest);

        const response = await backendRequest.get('/dummy-organism/get-released-data');

        expect(response.status()).toBe(401);
    });

    test('get-released-data accepts a token of the instance', async ({ backendRequest }) => {
        const accessToken = await getAccessToken(backendRequest);

        const response = await backendRequest.get('/dummy-organism/get-released-data', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        expect(response.status()).toBe(200);
    });
});
