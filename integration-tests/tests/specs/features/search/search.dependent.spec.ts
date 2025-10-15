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

        // Visual regression test - search with filters
        await expect(page).toHaveScreenshot('search-with-filters.png');

        await searchPage.resetSearchForm();
        expect(new URL(page.url()).searchParams.size).toBe(0);

        // Visual regression test - search after reset
        await expect(page).toHaveScreenshot('search-after-reset.png');
    });

    test('hidden field values are kept in the URL params', async ({ page }) => {
        await searchPage.ebolaSudan();

        // This is just to ensure that things are interactive and ready - bit of a hack for now
        await searchPage.select('Collection country', 'France');
        await searchPage.clearSelect('Collection country');
        await searchPage.enableSearchFields('Is revocation', 'Version status');
        await searchPage.clearSelect('Is revocation');
        await searchPage.clearSelect('Version status');

        // Assert that the empty values are in the search Params
        const searchParams = new URL(page.url()).searchParams;
        expect(searchParams.has('isRevocation')).toBeTruthy();
        expect(searchParams.get('isRevocation')).toBe('');
        expect(searchParams.has('versionStatus')).toBeTruthy();
        expect(searchParams.get('versionStatus')).toBe('');
    });
});
