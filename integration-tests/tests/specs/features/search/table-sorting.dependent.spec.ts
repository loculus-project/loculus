import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

test.describe('Search table sorting', () => {
    test('should sort by collection date when clicking column header', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const rows = searchPage.getSequenceRows();
        await rows.first().waitFor();

        // Get the first row text before sorting
        const firstRowText = await rows.first().innerText();

        // Click on "COLLECTION DATE" column header to toggle sort direction
        // Column headers are uppercase th elements
        await page
            .locator('th')
            .filter({ hasText: /collection date/i })
            .click();
        await page.waitForTimeout(1000);

        // After clicking, the sort should change - verify the first row is different
        const firstRowTextAfterSort = await rows.first().innerText();
        expect(firstRowTextAfterSort).not.toBe(firstRowText);
    });

    test('should update URL params when sorting changes', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const rows = searchPage.getSequenceRows();
        await rows.first().waitFor();

        // Click on "COLLECTION COUNTRY" column header to sort by country
        await page
            .locator('th')
            .filter({ hasText: /collection country/i })
            .click();
        await page.waitForTimeout(1000);

        const urlParams = new URL(page.url()).searchParams;
        expect(urlParams.has('orderBy')).toBeTruthy();
    });
});
