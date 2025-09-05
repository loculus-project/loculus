import { expect } from '@playwright/test';
import { test } from '../../../fixtures/auth.fixture';
import { SearchPage } from '../../../pages/search.page';

test.describe('Search', () => {
    let searchPage: SearchPage;

    test.beforeEach(({ page }) => {
        searchPage = new SearchPage(page);
    });

    test('country filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();
        await searchPage.resetSearchForm();
        await searchPage.select('Collection country', 'France');
        await expect(page.getByText(/Collection country:\s*France/)).toBeVisible();
        await page.getByLabel('remove Collection country filter').click();
        await expect(page.getByText(/Collection country:\s*France/)).toBeHidden();
        await expect(page.getByLabel('Collection country')).toBeEmpty();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });

    test('mutation filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();
        await searchPage.resetSearchForm();
        await searchPage.enterMutation('A23T');
        await expect(page.getByText(/^(Mutations|mutation):\s*A23T$/)).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByText(/^(Mutations|mutation):\s*A23T$/)).toBeHidden();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });

    test('substring-search filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();
        await searchPage.resetSearchForm();
        await searchPage.enableSearchFields('Author affiliations');
        await searchPage.fill('Author affiliations', 'foo');
        await expect(page.getByText('Author affiliations:foo')).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByLabel('Author affiliations')).toBeEmpty();
    });

    test('date range filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();
        await searchPage.resetSearchForm();

        await page.getByPlaceholder('yyyy-mm-dd').first().click();
        await page.getByTestId('calendar').getByText('20', { exact: true }).click();
        await expect(page.getByText('Collection date - From:')).toBeVisible();

        await page
            .locator('div')
            .filter({ hasText: /Collection date - From:/ })
            .getByLabel('remove filter')
            .click();
        await expect(page.getByPlaceholder('yyyy-mm-dd').first()).toBeEmpty();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });
});
