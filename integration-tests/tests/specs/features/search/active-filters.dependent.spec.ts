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
        
        // Click the X button in the active filter chip
        const filterChip = page.locator('text=/Collection country:\\s*France/').locator('..');
        await filterChip.getByRole('button').click();
        
        await expect(page.getByText(/Collection country:\s*France/)).toBeHidden();
        
        // Check that the combobox input is empty
        const countryCombo = page.getByRole('combobox', { name: 'Collection country' }).first();
        await expect(countryCombo).toHaveValue('');
        
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
        
        // Wait for filter to be applied
        await page.waitForTimeout(1000);

        // Find and click the remove button for the date filter
        const dateFilterChip = page.locator('text=/Collection date - From:/').locator('..');
        await dateFilterChip.getByRole('button').click();
        
        await expect(page.getByPlaceholder('yyyy-mm-dd').first()).toBeEmpty();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });
});
