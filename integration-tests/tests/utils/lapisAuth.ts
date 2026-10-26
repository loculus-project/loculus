import { type APIRequestContext, type Page } from '@playwright/test';

/**
 * Helpers for specs that talk to LAPIS (and Keycloak) directly, i.e. without going through
 * the website. They mirror `getBackendBaseUrl()` in `specs/backend/authentication.spec.ts`:
 * locally (k3d) the services are exposed on fixed ports on localhost (see the port mappings
 * in `deploy.py`), on server deployments they live on `lapis-<host>` / `authentication-<host>`
 * (see the `subdomainSeparator` convention in the Helm chart).
 *
 * LAPIS is only authenticated when the deployment sets `lapis.auth.enabled` (PR 5 of the
 * LAPIS authentication plan enables it for the e2e/dev environment). Specs combine
 * {@link isLapisAuthenticationEnabled} with {@link isLocalDeployment} to skip only on remote
 * deployments without auth while failing hard in the e2e/dev environment if auth is off.
 */

const KEYCLOAK_REALM = 'loculus';

/** The test account created by the chart when `createTestAccounts` is enabled. */
const TEST_USER = { username: 'testuser', password: 'testuser' } as const;

function isLocalHost(hostname: string): boolean {
    return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Whether the tests run against the local e2e/dev environment (k3d) rather than a remote
 * deployment. The e2e/dev environment is controlled by this repository and enables LAPIS
 * auth (`values_e2e_and_dev.yaml`), so specs must assert auth there instead of silently
 * skipping.
 */
export function isLocalDeployment(): boolean {
    const baseUrl = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000');
    return isLocalHost(baseUrl.hostname);
}

/**
 * The external (public) LAPIS base URL, e.g. `http://localhost:8080` locally or
 * `https://lapis-main.loculus.org` on server deployments.
 * Organism-scoped paths (e.g. `/dummy-organism/sample/details`) are routed to the
 * per-organism LAPIS instance by the ingress' strip-prefix middleware.
 */
export function getLapisBaseUrl(): URL {
    const configuredLapisUrl = process.env.PLAYWRIGHT_TEST_LAPIS_URL;
    if (configuredLapisUrl !== undefined && configuredLapisUrl !== '') {
        return new URL(configuredLapisUrl);
    }

    const baseUrl = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000');
    if (isLocalHost(baseUrl.hostname)) {
        const protocol = baseUrl.protocol === 'https:' ? 'https:' : 'http:';
        return new URL(`${protocol}//localhost:8080`);
    }

    const lapisHostname = baseUrl.hostname.startsWith('lapis')
        ? baseUrl.hostname
        : `lapis-${baseUrl.hostname}`;
    return new URL(`${baseUrl.protocol}//${lapisHostname}`);
}

/**
 * The public Keycloak base URL, e.g. `http://localhost:8083` locally or
 * `https://authentication-main.loculus.org` on server deployments.
 */
export function getKeycloakBaseUrl(): URL {
    const configuredKeycloakUrl = process.env.PLAYWRIGHT_TEST_KEYCLOAK_URL;
    if (configuredKeycloakUrl !== undefined && configuredKeycloakUrl !== '') {
        return new URL(configuredKeycloakUrl);
    }

    const baseUrl = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000');
    if (isLocalHost(baseUrl.hostname)) {
        const protocol = baseUrl.protocol === 'https:' ? 'https:' : 'http:';
        return new URL(`${protocol}//localhost:8083`);
    }

    const keycloakHostname = baseUrl.hostname.startsWith('authentication')
        ? baseUrl.hostname
        : `authentication-${baseUrl.hostname}`;
    return new URL(`${baseUrl.protocol}//${keycloakHostname}`);
}

/**
 * Whether the LAPIS instance rejects unauthenticated data requests, i.e. whether
 * `lapis.auth.enabled` is set for this deployment.
 *
 * Only a 200 counts as "authentication disabled": any other status (e.g. a 502/503 from a
 * broken ingress or a crash-looping LAPIS) throws instead of silently skipping the specs,
 * so that infrastructure breakage cannot mask itself as "feature not enabled".
 */
export async function isLapisAuthenticationEnabled(
    request: APIRequestContext,
    organism: string,
): Promise<boolean> {
    const detailsUrl = `${getLapisBaseUrl().origin}/${organism}/sample/details`;
    const response = await request.get(detailsUrl);
    if (response.status() === 401) {
        return true;
    }
    if (response.status() === 200) {
        return false;
    }
    throw new Error(
        `Could not determine whether LAPIS requires authentication: GET ${detailsUrl} answered ` +
            `${response.status()} instead of 200 (auth off) or 401 (auth on).`,
    );
}

/**
 * Mints a Keycloak-issued JWT that LAPIS accepts, or returns `undefined` if Keycloak refused
 * the grant.
 *
 * LAPIS validates signature and expiry of the token but no roles, audiences or issuers,
 * so any Keycloak token of the realm works. Tests use a password grant for the `testuser`
 * test account, which needs no secret and works wherever the chart created the test
 * accounts (`createTestAccounts`, e.g. e2e/dev and preview servers).
 *
 * Deployments without test accounts (e.g. production) yield `undefined`, and the positive
 * token spec skips itself (see `authentication.spec.ts`).
 *
 * Only a Keycloak *response* that refuses the grant yields `undefined` — network errors and
 * other unexpected failures still throw, so infrastructure breakage stays visible.
 */
export async function tryGetLapisAccessToken(
    request: APIRequestContext,
): Promise<string | undefined> {
    const tokenUrl = `${getKeycloakBaseUrl().origin}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

    const form: Record<string, string> = {
        grant_type: 'password',
        client_id: 'backend-client',
        // The website's auth middleware validates the session via Keycloak's userinfo endpoint,
        // which rejects access tokens without the 'openid' scope.
        scope: 'openid',
        username: TEST_USER.username,
        password: TEST_USER.password,
    };

    const response = await request.post(tokenUrl, { form });
    if (!response.ok()) {
        // Keycloak answered but refused the grant (e.g. invalid_grant: no test account on this
        // deployment). The caller decides whether that is a skip or a failure.
        return undefined;
    }

    const responseBody = (await response.json()) as { access_token?: unknown };
    const token = responseBody.access_token;
    if (typeof token !== 'string' || token === '') {
        return undefined;
    }
    return token;
}

/**
 * Logs the `testuser` test account into the *website* by performing a Keycloak password grant
 * and placing the resulting tokens directly into the browser context as the website's httpOnly
 * session cookies (`access_token` / `refresh_token`, see `authMiddleware.ts`). This is much
 * faster than the UI login flow and works on pages whose access the middleware enforces.
 *
 * When the deployment has LAPIS authentication disabled (website data pages open to anonymous
 * visitors, e.g. production until the rollout), the call is a no-op: no test account is needed
 * there. When LAPIS authentication is enabled but the grant fails, the deployment is broken
 * for these tests and the helper throws (instead of silently proceeding anonymously).
 */
export async function loginTestUserWithCookies(page: Page): Promise<void> {
    const tokenUrl = `${getKeycloakBaseUrl().origin}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

    const response = await page.request.post(tokenUrl, {
        form: {
            grant_type: 'password',
            client_id: 'backend-client',
            // Keycloak's userinfo endpoint (used by the website's auth middleware to validate
            // the session) rejects access tokens without the 'openid' scope, which would make
            // the middleware delete these cookies again and log the user out.
            scope: 'openid',
            username: TEST_USER.username,
            password: TEST_USER.password,
        },
    });

    if (!response.ok()) {
        // No test account here: fine as long as the website does not gate data pages. Probe a
        // data route through the website's own LAPIS proxy (which requires a session exactly
        // when LAPIS authentication is enabled).
        const baseUrl = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000');
        const probe = await page.request.get(
            `${baseUrl.origin}/api/lapis/dummy-organism/sample/details`,
        );
        if (probe.status() !== 401) {
            return;
        }
        throw new Error(
            `Could not log the test account in: Keycloak refused the password grant ` +
                `(${response.status()}) while the website requires a login for data pages. ` +
                'Check that `createTestAccounts` is enabled in the deployment values.',
        );
    }

    const responseBody = (await response.json()) as {
        access_token?: unknown;
        refresh_token?: unknown;
    };
    const accessToken = responseBody.access_token;
    const refreshToken = responseBody.refresh_token;
    if (typeof accessToken !== 'string' || accessToken === '') {
        throw new Error('Keycloak granted a token without an access_token field');
    }
    if (typeof refreshToken !== 'string' || refreshToken === '') {
        throw new Error('Keycloak granted a token without a refresh_token field');
    }

    const baseUrl = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000');
    await page.context().addCookies([
        { name: 'access_token', value: accessToken, url: baseUrl.origin },
        { name: 'refresh_token', value: refreshToken, url: baseUrl.origin },
    ]);

    // Fail loudly when the website rejects this session instead of letting every subsequent
    // locator wait time out on the Keycloak login page (e.g. the middleware's userinfo call
    // refusing the token). '/user' always enforces a login and redirects anonymous callers to
    // Keycloak, so a redirect means the injected session is not accepted.
    const sessionProbe = await page.request.get(`${baseUrl.origin}/user`, {
        maxRedirects: 0,
    });
    if (sessionProbe.status() >= 300 && sessionProbe.status() < 400) {
        throw new Error(
            `The website rejected the injected session cookies: GET /user answered with a ` +
                `redirect (${sessionProbe.status()}) instead of rendering the page. Check that the ` +
                'password grant requests the scopes the auth middleware needs (openid).',
        );
    }
}
