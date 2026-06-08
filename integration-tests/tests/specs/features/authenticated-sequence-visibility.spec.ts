import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { test } from '../../fixtures/console-warnings.fixture';
import { AuthPage } from '../../pages/auth.page';

const cchfAccessionVersion = 'LOC_00057KC.1';
const cchfOrganism = 'cchf';

type TokenResponse = { access_token?: unknown };
type AggregatedResponse = { data: { count: number }[] };
type DetailsResponse = { data: unknown[] };

function getBackendBaseUrl(): URL {
    const configuredBackendUrl = process.env.PLAYWRIGHT_TEST_BACKEND_URL;
    if (configuredBackendUrl !== undefined && configuredBackendUrl !== '') {
        return new URL(configuredBackendUrl);
    }

    const baseUrl = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000');
    if (baseUrl.hostname === 'localhost' || baseUrl.hostname === '127.0.0.1') {
        return new URL(`${baseUrl.protocol}//localhost:8079`);
    }

    return new URL(`${baseUrl.protocol}//backend-${baseUrl.hostname}`);
}

function getKeycloakBaseUrl(): URL {
    const configuredKeycloakUrl = process.env.PLAYWRIGHT_TEST_KEYCLOAK_URL;
    if (configuredKeycloakUrl !== undefined && configuredKeycloakUrl !== '') {
        return new URL(configuredKeycloakUrl);
    }

    const baseUrl = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000');
    if (baseUrl.hostname === 'localhost' || baseUrl.hostname === '127.0.0.1') {
        return new URL(`${baseUrl.protocol}//localhost:8083`);
    }

    return new URL(`${baseUrl.protocol}//keycloak-${baseUrl.hostname}`);
}

async function getAccessToken(request: APIRequestContext, username: string, password: string) {
    const tokenResponse = await request.post(
        new URL('/realms/loculus/protocol/openid-connect/token', getKeycloakBaseUrl()).toString(),
        {
            form: {
                client_id: 'backend-client',
                grant_type: 'password',
                username,
                password,
            },
        },
    );

    expect(tokenResponse.status()).toBe(200);
    const body = (await tokenResponse.json()) as TokenResponse;
    if (typeof body.access_token !== 'string') {
        throw new Error('Keycloak token response did not contain an access token');
    }
    return body.access_token;
}

async function getBackendCount(request: APIRequestContext, accessToken?: string) {
    const response = await request.post(
        new URL(`/query/${cchfOrganism}/current/aggregated`, getBackendBaseUrl()).toString(),
        {
            headers:
                accessToken === undefined ? undefined : { Authorization: `Bearer ${accessToken}` },
            data: { fields: [] },
        },
    );

    if (accessToken === undefined) {
        expect(response.status()).toBe(401);
        return undefined;
    }

    expect(response.status()).toBe(200);
    const body = (await response.json()) as AggregatedResponse;
    const firstRow = body.data[0];
    if (firstRow === undefined) {
        throw new Error('Backend aggregated response did not contain a count row');
    }
    return firstRow.count;
}

async function getBackendDetailsCount(request: APIRequestContext, accessToken: string) {
    const response = await request.post(
        new URL(`/query/${cchfOrganism}/current/metadata`, getBackendBaseUrl()).toString(),
        {
            headers: { Authorization: `Bearer ${accessToken}` },
            data: {
                accessionVersion: cchfAccessionVersion,
                fields: ['accessionVersion'],
                limit: 1,
            },
        },
    );

    expect(response.status()).toBe(200);
    const body = (await response.json()) as DetailsResponse;
    return body.data.length;
}

async function getLandingCchfCount(page: Page) {
    await page.goto('/');
    const cchfCard = page.locator('a[href="/cchf"]').filter({ hasText: 'Crimean-Congo' }).first();
    await expect(cchfCard).toBeVisible();

    const cardText = await cchfCard.innerText();
    const match = cardText.match(/([0-9,]+)\s+sequences/);
    if (match === null || match[1] === undefined) {
        throw new Error(`Could not read CCHF sequence count from landing card: ${cardText}`);
    }
    return Number(match[1].replace(/,/g, ''));
}

test.describe('Authenticated sequence visibility', () => {
    test('does not expose sequence data to unauthenticated users', async ({ page, request }) => {
        await getBackendCount(request);

        await expect.poll(() => getLandingCchfCount(page)).toBe(0);

        await page.goto(`/${cchfOrganism}/search`);
        await expect(page.getByText('Search returned 0 sequences')).toBeVisible();
        await expect(page.locator('[data-testid="sequence-row"]')).toHaveCount(0);

        await page.goto(`/seq/${cchfAccessionVersion}`);
        await expect(page.getByText('Authentication required')).toBeVisible();
    });

    test('does not expose another group sequence data to testuser', async ({ page, request }) => {
        const accessToken = await getAccessToken(request, 'testuser', 'testuser');
        expect(await getBackendCount(request, accessToken)).toBe(0);
        expect(await getBackendDetailsCount(request, accessToken)).toBe(0);

        const authPage = new AuthPage(page);
        expect(await authPage.login('testuser', 'testuser')).toBe(true);

        await expect.poll(() => getLandingCchfCount(page)).toBe(0);

        await page.goto(`/${cchfOrganism}/search`);
        await expect(page.getByText('Search returned 0 sequences')).toBeVisible();
        await expect(page.locator('[data-testid="sequence-row"]')).toHaveCount(0);

        await page.goto(`/seq/${cchfAccessionVersion}`);
        await expect(page.getByText('Entry not found')).toBeVisible();
    });

    test('exposes sequence data to superuser', async ({ page, request }) => {
        const accessToken = await getAccessToken(request, 'superuser', 'superuser');
        expect(await getBackendCount(request, accessToken)).toBeGreaterThan(0);
        expect(await getBackendDetailsCount(request, accessToken)).toBe(1);

        const authPage = new AuthPage(page);
        expect(await authPage.login('superuser', 'superuser')).toBe(true);

        await expect.poll(() => getLandingCchfCount(page)).toBeGreaterThan(0);

        await page.goto(`/${cchfOrganism}/search?selectedSeq=${cchfAccessionVersion}`);
        await expect(page.getByText(/Search returned [1-9][0-9,]* sequence/)).toBeVisible();
        await expect(page.locator('[data-testid="sequence-row"]').first()).toBeVisible();

        await page.goto(`/seq/${cchfAccessionVersion}`);
        await expect(page.getByText(cchfAccessionVersion).first()).toBeVisible();
        await expect(page.getByText('Entry not found')).not.toBeVisible();
    });
});
