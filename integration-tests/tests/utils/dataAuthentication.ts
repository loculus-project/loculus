import {
    expect,
    request as playwrightRequest,
    type APIRequestContext,
    type Page,
} from '@playwright/test';

/**
 * Helpers for `auth.requireAuthenticationForData`, which `values_e2e_and_dev.yaml` enables. Remote deployments may
 * have it disabled; specs then skip the assertions that only hold with the flag.
 */

/** The test account created by the chart when `createTestAccounts` is enabled. */
const TEST_USER = { username: 'testuser', password: 'testuser' } as const;

function getWebsiteBaseUrl(): URL {
    return new URL(process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000');
}

/** Whether the tests run against the local e2e/dev environment (k3d), whose values this repository controls. */
export function isLocalDeployment(): boolean {
    const { hostname } = getWebsiteBaseUrl();
    return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * The external URL of a service: fixed ports locally (see the port mappings in `deploy.py`),
 * `<service>-<host>` on server deployments. `PLAYWRIGHT_TEST_<SERVICE>_URL` overrides it.
 */
export function getServiceBaseUrl(
    service: 'backend' | 'lapis' | 'authentication',
    localPort: number,
): URL {
    const configuredUrl = process.env[`PLAYWRIGHT_TEST_${service.toUpperCase()}_URL`];
    if (configuredUrl !== undefined && configuredUrl !== '') {
        return new URL(configuredUrl);
    }

    const baseUrl = getWebsiteBaseUrl();
    if (isLocalDeployment()) {
        const protocol = baseUrl.protocol === 'https:' ? 'https:' : 'http:';
        return new URL(`${protocol}//localhost:${localPort}`);
    }
    const hostname = baseUrl.hostname.startsWith(service)
        ? baseUrl.hostname
        : `${service}-${baseUrl.hostname}`;
    return new URL(`${baseUrl.protocol}//${hostname}`);
}

export const getBackendBaseUrl = () => getServiceBaseUrl('backend', 8079);
export const getLapisBaseUrl = () => getServiceBaseUrl('lapis', 8080);
const getKeycloakBaseUrl = () => getServiceBaseUrl('authentication', 8083);

/** A request context for another service than the website, without the browser's cookies. */
export async function createServiceRequestContext(baseUrl: URL): Promise<APIRequestContext> {
    const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
    return playwrightRequest.newContext({
        baseURL: baseUrl.origin,
        ignoreHTTPSErrors: process.env.PLAYWRIGHT_TEST_IGNORE_HTTPS_ERRORS === 'true',
        proxy: proxyUrl ? { server: proxyUrl } : undefined,
    });
}

/**
 * Probes LAPIS: 401 means the deployment requires authentication for data, 200 means it doesn't. Anything else
 * throws, so that a broken deployment does not look like a disabled flag.
 */
export async function isAuthenticationForDataRequired(
    request: APIRequestContext,
): Promise<boolean> {
    const url = `${getLapisBaseUrl().origin}/dummy-organism/sample/details?limit=1`;
    const response = await request.get(url);
    if (response.status() === 401 || response.status() === 200) {
        return response.status() === 401;
    }
    throw new Error(`GET ${url} answered ${response.status()}, expected 200 or 401`);
}

/**
 * Skips the current test on remote deployments without the flag. Locally, the flag is part of the e2e values, so
 * it being off is a regression and fails the test instead.
 */
export async function skipUnlessAuthenticationForDataIsRequired(
    test: { skip: (condition: boolean, description: string) => void },
    request: APIRequestContext,
) {
    const required = await isAuthenticationForDataRequired(request);
    test.skip(
        !required && !isLocalDeployment(),
        'auth.requireAuthenticationForData is off on this deployment',
    );
    expect(
        required,
        'auth.requireAuthenticationForData is enabled in values_e2e_and_dev.yaml',
    ).toBe(true);
}

/**
 * Requests tokens for the test account with a password grant. Returns undefined on deployments without test
 * accounts. The `openid` scope is needed by the website, which validates sessions via Keycloak's userinfo endpoint.
 */
export async function getTestUserTokens(
    request: APIRequestContext,
): Promise<{ accessToken: string; refreshToken: string } | undefined> {
    const response = await request.post(
        `${getKeycloakBaseUrl().origin}/realms/loculus/protocol/openid-connect/token`,
        {
            form: {
                grant_type: 'password',
                client_id: 'backend-client',
                scope: 'openid',
                username: TEST_USER.username,
                password: TEST_USER.password,
            },
        },
    );
    if (!response.ok()) {
        return undefined;
    }
    const body = (await response.json()) as { access_token: string; refresh_token: string };
    return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

/**
 * Logs the test account into the website by setting the session cookies directly, which is much faster than the
 * login UI. On remote deployments without test accounts, the page stays anonymous.
 */
export async function loginTestUserWithCookies(page: Page): Promise<void> {
    const tokens = await getTestUserTokens(page.request);
    if (tokens === undefined) {
        if (isLocalDeployment()) {
            throw new Error('Could not log in the test account: is createTestAccounts enabled?');
        }
        return;
    }

    const { origin } = getWebsiteBaseUrl();
    await page.context().addCookies([
        { name: 'access_token', value: tokens.accessToken, url: origin },
        { name: 'refresh_token', value: tokens.refreshToken, url: origin },
    ]);

    // /user always requires a login, so a redirect means the website did not accept the session
    const response = await page.request.get(`${origin}/user`, { maxRedirects: 0 });
    expect(response.status(), 'the website should accept the injected session').toBe(200);
}
