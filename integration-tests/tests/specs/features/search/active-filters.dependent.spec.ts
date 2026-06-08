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

        const filterChip = page.locator('text=/Collection country:\\s*France/').locator('..');
        await filterChip.getByRole('button').click();

        await expect(page.getByText(/Collection country:\s*France/)).toBeHidden();

        const countryCombo = page.getByRole('combobox', { name: 'Collection country' }).first();
        await expect(countryCombo).toHaveValue('');

        expect(new URL(page.url()).searchParams.size).toBe(0);
    });

    test('mutation filter can be removed by clicking the X', async ({ page }) => {
        const mutation = 'A23T';
        await searchPage.ebolaSudan();
        await searchPage.enterMutation(mutation);
        await expect(page.getByText(`mutation:${mutation}`)).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByText(`mutation:${mutation}`)).toBeHidden();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });

    test('multi-segment mutation filter can be added and removed', async ({ page }) => {
        const mutation = 'G100A';
        await searchPage.cchf();
        await searchPage.enterSegmentedMutation(mutation, 'S');
        await expect(page.getByText(`mutation_S:${mutation}`)).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByText(`mutation_S:${mutation}`)).toBeHidden();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });

    test('substring-search filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();
        await searchPage.enableSearchFields('Author affiliations');
        await searchPage.fill('Author affiliations', 'foo');
        await expect(page.getByText('Author affiliations:foo')).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByLabel('Author affiliations')).toBeEmpty();
    });

    test('date range filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();

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
