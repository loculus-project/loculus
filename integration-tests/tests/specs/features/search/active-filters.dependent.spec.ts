import { expect } from '@playwright/test';
import { test } from '../../../fixtures/auth.fixture';
import { SearchPage } from '../../../pages/search.page';

test.describe('Search', () => {
    let searchPage: SearchPage;

    test.beforeEach(async ({ page }) => {
        searchPage = new SearchPage(page);
    });

    test('test that country filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();
        await searchPage.select('Collection country', 'France');
        await expect(page.getByText('Collection country:France')).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByText('Collection country:France')).not.toBeVisible();
        await expect(page.getByLabel('Collection country')).toBeEmpty();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });

    test('test that mutation filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();
        await searchPage.enterMutation('A23T');
        await expect(page.getByText('mutation:A23T')).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByText('mutation:A23T')).not.toBeVisible();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });

    test('test that substring-search filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();
        await searchPage.enableSearchFields('Author affiliations');
        await searchPage.fill('Author affiliations', 'foo');
        await expect(page.getByText('Author affiliations:foo')).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByLabel('Author affiliations')).toBeEmpty();
    });

    test('test that date range filter can be removed', async ({ page }) => {
        await searchPage.ebolaSudan();

        await searchPage.enterCollectionDateFrom('20240115');

        const fromInput = page.getByText('From').locator('..').locator('input[type="text"]');

        // Remove via the active filter's X button
        await page
            .locator('div')
            .filter({ hasText: /Collection date - From:/ })
            .getByLabel('remove filter')
            .click();
        await expect(fromInput).toHaveValue('YYYY-MM-DD');

        await expect(page.getByText('Collection date - From:')).not.toBeVisible();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });
});
