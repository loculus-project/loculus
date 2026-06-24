import { expect, type Page } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';

const sequenceRows = '[data-testid="sequence-row"]';

type InstanceConfigResponse = {
    config: {
        views: Record<string, { schema: string }>;
    };
};

test.describe('SQL-backed views', () => {
    test('landing page links to the overview and the overview shows released data', async ({
        page,
    }) => {
        await page.goto('/');

        const seeAllSamples = page.getByRole('link', { name: 'See all samples' });
        await expect(seeAllSamples).toBeVisible();
        await expect(seeAllSamples).toHaveAttribute('href', '/overview');
        await expect(page.getByRole('link', { name: 'Real organisms' })).toHaveAttribute(
            'href',
            '/views/real-organisms',
        );
        await expect(page.getByRole('link', { name: 'Test organisms' })).toHaveAttribute(
            'href',
            '/views/test-organisms',
        );
        await expect(page.getByRole('link', { name: 'Co-infections' })).toHaveAttribute(
            'href',
            '/views/co-infections',
        );
        await expect(
            page.getByText('Browse released records from the NCBI-ingested organism databases'),
        ).toBeVisible();
        await expect(page.getByText('Explore the configured test organisms')).toBeVisible();
        await expect(
            page.getByText(
                'Find real-organism records linked by submitting group and isolate name',
            ),
        ).toBeVisible();
        await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();

        await seeAllSamples.click();
        await expect(page).toHaveTitle(/Overview - Browse/);
        await expect(page.locator(sequenceRows).first()).toBeVisible({ timeout: 60_000 });
        await expect(page.getByRole('columnheader', { name: 'Organism' })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: 'Country' })).toBeVisible();
    });

    test('additional configured views load with their own schemas', async ({ page }) => {
        await page.goto('/views/real-organisms');
        await expect(page).toHaveTitle(/Real organisms - Browse/);
        await expect(page.locator(sequenceRows).first()).toBeVisible({ timeout: 60_000 });
        await expect(page.getByRole('columnheader', { name: 'Collection country' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Add search fields' })).toBeVisible();

        await page.goto('/views/test-organisms');
        await expect(page).toHaveTitle(/Test organisms - Browse/);
        await page.getByRole('button', { name: 'Add search fields' }).click();
        await expect(page.getByRole('checkbox', { name: 'Country', exact: true })).toBeVisible();
        await expect(page.getByRole('checkbox', { name: 'Lineage', exact: true })).toBeVisible();

        await page.goto('/views/co-infections');
        await expect(page).toHaveTitle(/Co-infections - Browse/);
        await expect(page.locator(sequenceRows).first()).toBeVisible({ timeout: 60_000 });
        await expect(page.getByRole('columnheader', { name: 'Isolate name' })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: 'Organism' })).toBeVisible();
        await expect(page.getByLabel('Isolate name')).toBeVisible();

        await page.goto('/views/co-infections?specimenCollectorSampleId=coinfection-preview-001');
        await expect(page.locator(sequenceRows)).toHaveCount(2, { timeout: 60_000 });
        await expect(
            page.locator(sequenceRows).filter({ hasText: 'coinfection-preview-001' }),
        ).toHaveCount(2);
        await expect(page.locator(sequenceRows).filter({ hasText: 'Ebola Sudan' })).toBeVisible();
        await expect(
            page.locator(sequenceRows).filter({ hasText: 'West Nile Virus' }),
        ).toBeVisible();
    });

    test('views sort by collection date descending by default', async ({ page }) => {
        await page.goto('/overview');
        await expectRowsSortedByDateDescending(page);

        await page.goto('/views/real-organisms');
        await expectRowsSortedByDateDescending(page);

        await page.goto('/views/co-infections');
        await expectRowsSortedByDateDescending(page);

        const backendUrl = process.env.PLAYWRIGHT_TEST_BACKEND_URL ?? 'http://localhost:8079';
        const response = await page.request.get(`${backendUrl}/api/config/instance`);
        expect(response.ok()).toBe(true);
        const instance = (await response.json()) as InstanceConfigResponse;
        expect(instance.config.views.overview.schema).toContain('defaultOrderBy: date');
        expect(instance.config.views['real-organisms'].schema).toContain(
            'defaultOrderBy: sampleCollectionDate',
        );
        expect(instance.config.views['co-infections'].schema).toContain(
            'defaultOrderBy: sampleCollectionDate',
        );
        expect(instance.config.views['test-organisms'].schema).toContain('defaultOrderBy: date');
    });
});

async function expectRowsSortedByDateDescending(page: Page) {
    await expect(page.locator(sequenceRows).first()).toBeVisible({ timeout: 60_000 });
    const rows = await page
        .locator(sequenceRows)
        .evaluateAll((elements) =>
            elements.slice(0, 5).map((element) => element.textContent ?? ''),
        );
    const dates = rows
        .map((row) => row.match(/\d{4}-\d{2}-\d{2}/)?.[0])
        .filter((date): date is string => date !== undefined);

    expect(dates.length).toBeGreaterThan(1);
    expect(dates).toEqual([...dates].sort().reverse());
}
