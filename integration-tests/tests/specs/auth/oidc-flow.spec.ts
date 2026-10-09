import { createHash, randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

import { test } from '../../fixtures/auth.fixture';
import { allowConsoleError } from '../../fixtures/console-warnings.fixture';
import { AuthPage } from '../../pages/auth.page';
import { type TestAccount } from '../../types/auth.types';

const transactionCookie = 'oidc_transactions';
const tokenCookies = ['access_token', 'refresh_token'];
const callbackPath = '/auth/callback';

async function submitCredentials(page: Page, account: TestAccount) {
    await page.getByLabel('Username').fill(account.username);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
}

async function expectAccount(page: Page, account: TestAccount) {
    await expect(page.getByRole('link', { name: 'My account', exact: true })).toBeVisible();
    await expect(page.getByText(account.username, { exact: true })).toBeVisible();
}

async function expectNoTokens(page: Page, websiteOrigin: string) {
    const cookies = await page.context().cookies(websiteOrigin);
    expect(cookies.filter((cookie) => tokenCookies.includes(cookie.name))).toHaveLength(0);
}

function allowRejectionResponse() {
    // Expected 400 responses produce a browser console error in Chromium.
    allowConsoleError(test, 'Failed to load resource: the server responded with a status of 400');
}

test.describe('OIDC browser login', () => {
    // Each scenario includes registration, logout and one or more complete provider round trips.
    test.setTimeout(120_000);
    test.beforeEach(async ({ page, testAccount }) => {
        const authPage = new AuthPage(page);
        await authPage.createAccount(testAccount);
        await expect(page.getByRole('link', { name: 'My account', exact: true })).toBeVisible();
        await authPage.logout();
    });

    test('returns to the protected destination and replaces the transaction cookie with session cookies', async ({
        page,
        testAccount,
    }) => {
        const websiteOrigin = new URL(page.url()).origin;
        const destination = new URL('/user?source=oidc-integration', websiteOrigin).toString();
        await page.goto(destination);
        await expect(page.getByLabel('Username')).toBeVisible();

        const authorizationUrl = new URL(page.url());
        expect(authorizationUrl.searchParams.get('state')).toBeTruthy();
        expect(authorizationUrl.searchParams.get('nonce')).toBeTruthy();
        expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');
        expect(authorizationUrl.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
            new URL(callbackPath, websiteOrigin).toString(),
        );

        const pending = (await page.context().cookies(websiteOrigin)).find(
            (cookie) => cookie.name === transactionCookie,
        );
        expect(pending).toMatchObject({
            httpOnly: true,
            sameSite: 'Lax',
            path: '/',
            secure: websiteOrigin.startsWith('https:'),
        });
        expect(pending?.expires).toBeGreaterThan(Date.now() / 1000 + 3500);
        expect(pending?.expires).toBeLessThanOrEqual(Date.now() / 1000 + 3605);

        await submitCredentials(page, testAccount);
        await expect(page).toHaveURL(destination);
        await expectAccount(page, testAccount);

        const cookies = await page.context().cookies(websiteOrigin);
        expect(cookies.find((cookie) => cookie.name === transactionCookie)).toBeUndefined();
        for (const name of tokenCookies) {
            expect(cookies.find((cookie) => cookie.name === name)).toMatchObject({
                httpOnly: true,
                sameSite: 'Lax',
                path: '/',
            });
        }
    });

    test('completes two pending login transactions independently', async ({
        page,
        testAccount,
    }) => {
        const websiteOrigin = new URL(page.url()).origin;
        const secondPage = await page.context().newPage();
        try {
            // Start sequentially: truly concurrent Set-Cookie responses can race.
            await page.goto('/auth/login?returnTo=%2Fuser%3Ftab%3Done');
            await expect(page.getByLabel('Username')).toBeVisible();
            const firstState = new URL(page.url()).searchParams.get('state');
            await secondPage.goto(
                new URL('/auth/login?returnTo=%2Fuser%3Ftab%3Dtwo', websiteOrigin).toString(),
            );
            await expect(secondPage.getByLabel('Username')).toBeVisible();
            expect(new URL(secondPage.url()).searchParams.get('state')).not.toBe(firstState);

            await submitCredentials(page, testAccount);
            await expect(page).toHaveURL(new URL('/user?tab=one', websiteOrigin).toString());
            expect(
                (await page.context().cookies(websiteOrigin)).some(
                    (cookie) => cookie.name === transactionCookie,
                ),
            ).toBe(true);

            await submitCredentials(secondPage, testAccount);
            await expect(secondPage).toHaveURL(new URL('/user?tab=two', websiteOrigin).toString());
            await expectAccount(secondPage, testAccount);
            expect(
                (await page.context().cookies(websiteOrigin)).some(
                    (cookie) => cookie.name === transactionCookie,
                ),
            ).toBe(false);
        } finally {
            await secondPage.close();
        }
    });

    test('offers a working retry when the browser has lost its login transaction', async ({
        page,
        testAccount,
    }) => {
        allowRejectionResponse();
        const websiteOrigin = new URL(page.url()).origin;
        await page.goto('/auth/login?returnTo=%2Fuser');
        await expect(page.getByLabel('Username')).toBeVisible();
        await page.context().clearCookies({ name: transactionCookie });

        await submitCredentials(page, testAccount);
        await expect(page).toHaveURL(new URL('/auth/login-failed', websiteOrigin).toString());
        await expect(
            page.getByRole('heading', { name: 'Login could not be completed' }),
        ).toBeVisible();
        await expectNoTokens(page, websiteOrigin);

        // Keycloak has authenticated the user; the retry can reuse its session.
        await page.getByRole('link', { name: 'Try logging in again' }).click();
        await expect(page).toHaveURL(new URL('/user', websiteOrigin).toString());
        await expectAccount(page, testAccount);
    });

    test('rejects mismatched state without consuming the legitimate transaction', async ({
        page,
        testAccount,
    }) => {
        allowRejectionResponse();
        const websiteOrigin = new URL(page.url()).origin;
        let originalCallback: string | undefined;
        const authenticationRequest = (url: URL) =>
            url.pathname.endsWith('/login-actions/authenticate');
        // Routing only intercepts the initial request in a redirect chain. Stop the provider's
        // credential response before its redirect reaches Astro, keeping the real code unused.
        await page.route(authenticationRequest, async (route) => {
            const response = await route.fetch({ maxRedirects: 0 });
            expect(response.status()).toBe(302);
            originalCallback = response.headers().location;
            expect(new URL(originalCallback).pathname).toBe(callbackPath);
            await route.fulfill({
                status: 200,
                contentType: 'text/plain',
                body: 'Callback held by test',
            });
        });
        await page.goto('/auth/login?returnTo=%2Fuser');
        await submitCredentials(page, testAccount);
        await expect(page.getByText('Callback held by test', { exact: true })).toBeVisible();
        await page.unroute(authenticationRequest);
        expect(originalCallback).toBeDefined();
        const altered = new URL(originalCallback);
        expect(altered.searchParams.get('code')).toBeTruthy();
        altered.searchParams.set('state', randomUUID());

        await page.goto(altered.toString());
        await expect(page).toHaveURL(new URL('/auth/login-failed', websiteOrigin).toString());
        await expectNoTokens(page, websiteOrigin);

        // Successful redemption proves the bad-state request neither consumed the transaction nor redeemed the code.
        await page.goto(originalCallback);
        await expect(page).toHaveURL(new URL('/user', websiteOrigin).toString());
        await expectAccount(page, testAccount);
    });

    for (const parameter of ['nonce', 'code_challenge']) {
        test(`rejects a login whose authorization request has a different ${parameter}`, async ({
            page,
            testAccount,
        }) => {
            allowRejectionResponse();
            const websiteOrigin = new URL(page.url()).origin;
            let changed = false;
            await page.route(
                (url) => url.origin === websiteOrigin && url.pathname === '/auth/login',
                async (route) => {
                    const response = await route.fetch({ maxRedirects: 0 });
                    expect(response.status()).toBe(302);
                    const url = new URL(response.headers().location);
                    expect(url.searchParams.get(parameter)).toBeTruthy();
                    // Change what Keycloak receives, leaving Astro's encrypted transaction untouched.
                    url.searchParams.set(
                        parameter,
                        createHash('sha256').update(randomUUID()).digest('base64url'),
                    );
                    changed = true;
                    await route.fulfill({
                        response,
                        headers: { ...response.headers(), location: url.toString() },
                    });
                },
            );
            await page.goto('/auth/login?returnTo=%2Fuser');
            expect(changed).toBe(true);
            const callback = page.waitForRequest((request) => {
                const url = new URL(request.url());
                return (
                    url.origin === websiteOrigin &&
                    url.pathname === callbackPath &&
                    url.searchParams.has('code')
                );
            });
            await submitCredentials(page, testAccount);
            await callback;
            expect(changed).toBe(true);
            await expect(page).toHaveURL(new URL('/auth/login-failed', websiteOrigin).toString());
            await expectNoTokens(page, websiteOrigin);
            expect(
                (await page.context().cookies(websiteOrigin)).some(
                    (cookie) => cookie.name === transactionCookie,
                ),
            ).toBe(false);
        });
    }
});

test('rejects external login return destinations without redirecting away from Loculus', async ({
    page,
}) => {
    allowRejectionResponse();
    let externalRequest = false;
    await page.route('https://attacker.test/**', async (route) => {
        externalRequest = true;
        await route.fulfill({ status: 200, body: 'Unexpected external navigation' });
    });
    const response = await page.goto('/auth/login?returnTo=https%3A%2F%2Fattacker.test%2F');
    expect(response?.status()).toBe(400);
    expect(new URL(page.url()).pathname).toBe('/auth/login');
    await expect(page.getByText('Invalid returnTo', { exact: true })).toBeVisible();
    expect(externalRequest).toBe(false);
});
