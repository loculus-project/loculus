import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

test.describe('Search', () => {
    let searchPage: SearchPage;

    test.beforeEach(({ page }) => {
        searchPage = new SearchPage(page);
    });

    test('search form resets when the reset button is clicked', async ({ page }) => {
        await searchPage.ebolaSudan();

        await searchPage.select('Collection country', 'France');
        await searchPage.enterMutation('A23T');
        await expect.soft(page.getByText('Collection country:France')).toBeVisible();
        await expect.soft(page.getByText('mutation:A23T')).toBeVisible();

        await searchPage.resetSearchForm();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });

    test('include-all toggle puts include=all in the URL', async ({ page }) => {
        await searchPage.ebolaSudan();

        // Default: query-service applies the latest-version / no-revocations
        // defaults; the website does not need to put anything in the URL.
        expect(new URL(page.url()).searchParams.has('include')).toBe(false);

        await page.getByTestId('include-all-toggle').check();
        await expect(page.getByTestId('include-all-toggle')).toBeChecked();
        expect(new URL(page.url()).searchParams.get('include')).toBe('all');

        await page.getByTestId('include-all-toggle').uncheck();
        expect(new URL(page.url()).searchParams.has('include')).toBe(false);
    });
});
