import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';

type OpenApiDocument = {
    paths: Record<string, unknown>;
};

function getBackendBaseUrl(): URL {
    const configuredBackendUrl = process.env.PLAYWRIGHT_TEST_BACKEND_URL;
    if (configuredBackendUrl !== undefined && configuredBackendUrl !== '') {
        return new URL(configuredBackendUrl);
    }

    const baseUrl = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000');
    if (baseUrl.hostname === 'localhost' || baseUrl.hostname === '127.0.0.1') {
        return new URL(`${baseUrl.protocol === 'https:' ? 'https:' : 'http:'}//localhost:8079`);
    }

    const backendHostname = baseUrl.hostname.startsWith('backend')
        ? baseUrl.hostname
        : `backend-${baseUrl.hostname}`;
    return new URL(`${baseUrl.protocol}//${backendHostname}`);
}

test.describe('API documentation', () => {
    test.describe.configure({ mode: 'serial' });

    test('links to split OpenAPI specifications', async ({ page }) => {
        await page.goto('/api-documentation');

        await expect(
            page.getByRole('heading', { name: 'Backend API specifications' }),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Query API specifications - databases' }),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Query API specifications - views' }),
        ).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
        await expect(page.locator('body')).not.toContainText('LAPIS');
        await expect(page.locator('body')).not.toContainText('Also available at');

        await expect(page.locator('a[href$="/api-docs.json"]')).toBeVisible();
        await expect(page.locator('a[href$="/api-docs/general.json"]')).toBeVisible();
        await expect(
            page.locator('a[href*="/swagger-ui/loculus?url=%2Fapi-docs%2Fgeneral.json"]'),
        ).toBeVisible();
        await expect(
            page.locator(
                'a[href*="/scalar-api-reference?url=%2Fapi-docs%2Fquery%2Foverview.json"]',
            ),
        ).toBeVisible();
    });

    test('serves complete, general, and per-query OpenAPI documents', async ({ page }) => {
        const backendUrl = getBackendBaseUrl().origin;

        const completeResponse = await page.request.get(`${backendUrl}/api-docs.json`);
        expect(completeResponse.ok()).toBe(true);
        const complete = (await completeResponse.json()) as OpenApiDocument;
        expect(Object.keys(complete.paths).some((path) => path.startsWith('/query/'))).toBe(true);
        expect(Object.keys(complete.paths).some((path) => !path.startsWith('/query/'))).toBe(true);

        const legacyResponse = await page.request.get(`${backendUrl}/api-docs`);
        expect(legacyResponse.status()).toBe(404);

        const generalResponse = await page.request.get(`${backendUrl}/api-docs/general.json`);
        expect(generalResponse.ok()).toBe(true);
        const general = (await generalResponse.json()) as OpenApiDocument;
        expect(Object.keys(general.paths).some((path) => path.startsWith('/query/'))).toBe(false);

        const overviewResponse = await page.request.get(
            `${backendUrl}/api-docs/query/overview.json`,
        );
        expect(overviewResponse.ok()).toBe(true);
        const overview = (await overviewResponse.json()) as OpenApiDocument;
        const overviewPaths = Object.keys(overview.paths);
        expect(overviewPaths.length).toBeGreaterThan(0);
        expect(overviewPaths.every((path) => path.startsWith('/query/overview/'))).toBe(true);
    });

    test('Swagger and Scalar load the selected query specification', async ({ page, context }) => {
        const backendUrl = getBackendBaseUrl().origin;
        const swaggerRequests: string[] = [];
        page.on('request', (request) => {
            const url = request.url();
            if (url.includes('/api-docs')) swaggerRequests.push(url);
        });

        await page.goto(`${backendUrl}/swagger-ui/loculus?url=/api-docs/query/overview.json`);
        await page.waitForLoadState('networkidle');
        await expect(page.getByRole('link', { name: 'Loculus home' })).toBeVisible();
        await expect(page.locator('#loculus-docs-spec')).toHaveValue(
            '/api-docs/query/overview.json',
        );
        await expect(page.locator('body')).toContainText('/query/overview/{versionGroup}/metadata');
        await expect(page.locator('body')).not.toContainText('/{organism}/submit');
        expect(swaggerRequests).toContain(`${backendUrl}/api-docs/query/overview.json`);

        const scalarPage = await context.newPage();
        const scalarRequests: string[] = [];
        scalarPage.on('request', (request) => {
            const url = request.url();
            if (url.includes('/api-docs')) scalarRequests.push(url);
        });

        await scalarPage.goto(
            `${backendUrl}/scalar-api-reference?url=/api-docs/query/overview.json`,
        );
        await scalarPage.waitForLoadState('networkidle');
        await expect(scalarPage.getByRole('link', { name: 'Loculus home' })).toBeVisible();
        await expect(scalarPage.locator('#loculus-docs-spec')).toHaveValue(
            '/api-docs/query/overview.json',
        );
        await expect(scalarPage.locator('body')).toContainText(
            '/query/overview/{versionGroup}/metadata',
        );
        await expect(scalarPage.locator('body')).not.toContainText('/{organism}/submit');
        expect(scalarRequests).toContain(`${backendUrl}/api-docs/query/overview.json`);
    });

    test('API reference bar can switch specifications', async ({ page }) => {
        const backendUrl = getBackendBaseUrl().origin;

        await page.goto(`${backendUrl}/swagger-ui/loculus?url=/api-docs/query/overview.json`);
        await expect(page.locator('body')).toContainText('/query/overview/{versionGroup}/metadata');
        await page.locator('#loculus-docs-spec').selectOption('/api-docs/general.json');
        await expect(page).toHaveURL(
            `${backendUrl}/swagger-ui/loculus?url=%2Fapi-docs%2Fgeneral.json`,
        );

        await page.goto(`${backendUrl}/scalar-api-reference?url=/api-docs/query/overview.json`);
        await expect(page.locator('body')).toContainText('/query/overview/{versionGroup}/metadata');
        await page.locator('#loculus-docs-spec').selectOption('/api-docs/general.json');
        await expect(page).toHaveURL(
            `${backendUrl}/scalar-api-reference?url=%2Fapi-docs%2Fgeneral.json`,
        );
    });
});
