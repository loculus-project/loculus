import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

test.describe('The search page', () => {
    test('should find no data in the future', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        // We look for a container having 'Collection date' and 'From' to target the range filter
        const collectionDateRangeFilter = page
            .locator('div')
            .filter({ hasText: 'Collection date' })
            .filter({ hasText: 'From' })
            .first();

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        const fromInput = collectionDateRangeFilter.getByPlaceholder('yyyy-mm-dd').first();

        await fromInput.click();
        await fromInput.fill(tomorrowStr);
        await fromInput.press('Enter');

        await expect(page.getByText(/No data/i)).toBeVisible();
    });
});
