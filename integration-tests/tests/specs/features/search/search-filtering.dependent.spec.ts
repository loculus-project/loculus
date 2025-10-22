import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

test.describe('Search filtering functionality', () => {
    test('should display search results when navigating to organism', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const rows = searchPage.getSequenceRows();
        await rows.first().waitFor();

        const rowCount = await rows.count();
        expect(rowCount).toBeGreaterThan(0);
    });

    test('should filter sequences by country using select', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        await searchPage.select('Collection country', 'France');

        const rows = searchPage.getSequenceRows();
        await rows.first().waitFor();

        const rowCount = await rows.count();
        expect(rowCount).toBeGreaterThan(0);

        await expect(page.getByText('Collection country:France')).toBeVisible();
    });

    test('should clear filters when reset button is clicked', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        await searchPage.select('Collection country', 'France');
        await expect(page.getByText('Collection country:France')).toBeVisible();

        await searchPage.resetSearchForm();

        const urlParams = searchPage.getUrlParams();
        expect(urlParams.size).toBe(0);
    });
});
