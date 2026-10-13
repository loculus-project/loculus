import { request as playwrightRequest, expect, type APIRequestContext } from '@playwright/test';

import { test as baseTest } from '../../fixtures/console-warnings.fixture';
import {
    getLapisBaseUrl,
    isLapisAuthenticationEnabled,
    isLocalDeployment,
    tryGetLapisAccessToken,
} from '../../utils/lapisAuth';

/**
 * Verifies LAPIS's Keycloak JWT authentication end to end against the deployed LAPIS
 * instances (enabled via `lapis.auth.enabled` in `values_e2e_and_dev.yaml`.
 *
 * The auth specs only skip themselves on remote deployments that have not enabled LAPIS
 * auth yet. In the e2e/dev environment that
 * this repository controls (auth enabled via `lapis.auth.enabled` in
 * `values_e2e_and_dev.yaml`), auth being off is a regression this spec must catch, not skip
 */

// At least two organisms, including one multi-segment one, as required by the plan.
const AUTH_SPEC_ORGANISMS = {
    // single segment
    'dummy-organism': 'Test organism',
    // multi segment (L, M, S)
    cchf: 'Crimean-Congo Hemorrhagic Fever Virus',
} as const;

// Paths that LAPIS keeps public when authentication is enabled (its `PUBLIC_ROUTES`).
const PUBLIC_PATHS = ['/actuator/health', '/api-docs', '/swagger-ui/index.html'] as const;

const test = baseTest.extend<{ lapisRequest: APIRequestContext }>({
    lapisRequest: async ({}, use) => {
        const baseUrl = getLapisBaseUrl();

        const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
        const ignoreHTTPSErrors = process.env.PLAYWRIGHT_TEST_IGNORE_HTTPS_ERRORS === 'true';

        const requestContext = await playwrightRequest.newContext({
            baseURL: baseUrl.origin,
            ignoreHTTPSErrors,
            proxy: proxyUrl ? { server: proxyUrl } : undefined,
        });

        await use(requestContext);
        await requestContext.dispose();
    },
});

/**
 * Guards the auth specs: skips on remote deployments without LAPIS auth, but fails hard in
 * the e2e/dev environment (and on rolled-out remote deployments) when LAPIS does not
 * require authentication.
 */
async function expectLapisAuthenticationOrSkipOnRemote(
    lapisRequest: APIRequestContext,
    organism: string,
) {
    const authEnabled = await isLapisAuthenticationEnabled(lapisRequest, organism);
    test.skip(
        !authEnabled && !isLocalDeployment(),
        'LAPIS authentication is not enabled on this remote deployment',
    );
    expect(
        authEnabled,
        'LAPIS must require authentication here: check lapis.auth.enabled in the deployment ' +
            'values and the jwk-set-uri argument of the LAPIS deployment',
    ).toBe(true);
}

test.describe('LAPIS authentication', () => {
    for (const [organism, organismName] of Object.entries(AUTH_SPEC_ORGANISMS)) {
        test.describe(`organism ${organism} (${organismName})`, () => {
            test('rejects requests without a token and advertises Bearer authentication', async ({
                lapisRequest,
            }) => {
                await expectLapisAuthenticationOrSkipOnRemote(lapisRequest, organism);

                const response = await lapisRequest.get(`/${organism}/sample/details`);

                expect(response.status()).toBe(401);
                expect(response.headers()['www-authenticate']).toContain('Bearer');
            });

            test('rejects requests with a malformed token', async ({ lapisRequest }) => {
                await expectLapisAuthenticationOrSkipOnRemote(lapisRequest, organism);

                const response = await lapisRequest.get(`/${organism}/sample/details`, {
                    headers: { Authorization: 'Bearer not-a-json-web-token' },
                });

                expect(response.status()).toBe(401);
            });

            test('accepts requests with a Keycloak token', async ({ lapisRequest }) => {
                await expectLapisAuthenticationOrSkipOnRemote(lapisRequest, organism);

                const token = await tryGetLapisAccessToken(lapisRequest);
                if (token === undefined) {
                    // No way to mint a token on this deployment: no test account
                    // (createTestAccounts). After the rollout of a remote deployment that is
                    // expected and skips; in the e2e/dev environment it is a setup regression
                    // and must fail hard.
                    test.skip(
                        !isLocalDeployment(),
                        'Cannot mint a LAPIS token on this remote deployment: provide test ' +
                            'accounts (createTestAccounts) to run this spec',
                    );
                    expect(
                        token,
                        'Could not mint a Keycloak token for LAPIS although the e2e environment ' +
                            'creates test accounts; check the Keycloak configuration',
                    ).toBeDefined();
                }

                const response = await lapisRequest.get(`/${organism}/sample/details`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                expect(response.status()).toBe(200);
                const body: unknown = await response.json();
                expect(body).toHaveProperty('data');
            });
        });
    }

    for (const publicPath of PUBLIC_PATHS) {
        test(`serves '${publicPath}' without a token`, async ({ lapisRequest }) => {
            // Public paths stay reachable no matter whether LAPIS auth is enabled or not,
            // so this spec runs unconditionally: it guards the k8s probes and the API
            // documentation links against future LAPIS security-config changes.
            const response = await lapisRequest.get(`/dummy-organism${publicPath}`);

            expect(response.status()).toBe(200);
        });
    }
});
