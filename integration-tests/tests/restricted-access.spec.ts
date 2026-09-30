import { expect, test } from '@playwright/test';

test.use({ trace: 'off' });
// Opt in only against a disposable restricted instance; ordinary CI uses public mode.
test.skip(
    process.env.RESTRICTED_ACCESS_TESTS !== 'true',
    'Requires restricted instance configuration',
);
const backend = process.env.RESTRICTED_BACKEND_URL;
const issuer = process.env.RESTRICTED_ISSUER_URL;

test.beforeEach(() => {
    expect(backend, 'Set RESTRICTED_BACKEND_URL').toBeTruthy();
    expect(issuer, 'Set RESTRICTED_ISSUER_URL').toBeTruthy();
});

test('anonymous data requests are denied without redirecting API clients', async ({
    page,
    request,
}) => {
    await page.goto('/');
    await expect(page.getByText('Sign in to browse data').first()).toBeVisible();
    expect((await request.get(`${backend}/ebola-sudan/get-released-data`)).status()).toBe(401);
    expect(
        (await request.get('/lapis/ebola-sudan/sample/aggregated', { maxRedirects: 0 })).status(),
    ).toBe(401);
    await page.goto('/ebola-sudan/search');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /register/i })).toHaveCount(0);
});

for (const actor of [
    { username: 'testuser', contribute: false, manage: false },
    { username: 'testcontributor', contribute: true, manage: false },
    { username: 'superuser', contribute: true, manage: true },
]) {
    test(`${actor.username}: API capabilities and browser gates agree`, async ({
        page,
        request,
    }) => {
        // Never attach token responses or browser storage state to test reports.
        const login = await request.post(`${issuer}/protocol/openid-connect/token`, {
            form: {
                client_id: 'backend-client',
                grant_type: 'password',
                username: actor.username,
                password: actor.username,
            },
        });
        expect(login.status()).toBe(200);
        const payload = (await login.json()) as { access_token?: unknown };
        if (typeof payload.access_token !== 'string') throw new Error('Missing access token');
        const token = payload.access_token;
        const headers = { Authorization: `Bearer ${token}` };
        const capabilities = await request.get(`${backend}/access/capabilities`, { headers });
        expect(await capabilities.json()).toEqual({
            canReadReleasedData: true,
            canContribute: actor.contribute,
            canManageMembership: actor.manage,
        });
        const query = await request.get('/lapis/ebola-sudan/sample/aggregated', { headers });
        expect(query.status()).toBe(200);
        expect(query.headers()['cache-control']).toContain('no-store');
        if (!actor.contribute) {
            expect(
                (await request.get(`${backend}/ebola-sudan/get-sequences`, { headers })).status(),
            ).toBe(403);
            expect(
                (await request.post(`${backend}/ebola-sudan/submit`, { headers })).status(),
            ).toBe(403);
        }
        // An invalid body cannot create a group even if a regression opens the gate.
        if (!actor.manage) {
            expect((await request.post(`${backend}/groups`, { headers, data: {} })).status()).toBe(
                403,
            );
        }
        await page.goto('/auth/login?returnTo=%2Fuser');
        await page.getByLabel(/username or email/i).fill(actor.username);
        await page.getByLabel('Password', { exact: true }).fill(actor.username);
        await page.getByRole('button', { name: /sign in/i }).click();
        await expect(page).toHaveURL(/\/user$/);
        await expect(
            page.getByRole('heading', { name: actor.username, exact: true }),
        ).toBeVisible();
        await expect(page.getByRole('link', { name: 'Create a new submitting group' })).toHaveCount(
            actor.manage ? 1 : 0,
        );
        const groupPage = await page.goto('/user/createGroup');
        expect(groupPage?.status()).toBe(actor.manage ? 200 : 403);
        if (!actor.contribute) {
            expect((await page.goto('/ebola-sudan/submission'))?.status()).toBe(403);
        }
    });
}

test('invalid bearer token cannot query LAPIS', async ({ request }) => {
    const response = await request.get('/lapis/ebola-sudan/sample/aggregated', {
        headers: { Authorization: 'Bearer invalid-test-token' },
    });
    expect(response.status()).toBe(401);
});
