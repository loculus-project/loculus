import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

function getTomorrowIsoDate(): string {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const year = tomorrow.getFullYear().toString().padStart(4, '0');
    const month = (tomorrow.getMonth() + 1).toString().padStart(2, '0');
    const day = tomorrow.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

test.describe('Search future date filters', () => {
    test('shows no data when filtering by a future collection date', async ({ page }) => {
        const searchPage = new SearchPage(page);

        await searchPage.ebolaSudan();

        const tomorrow = getTomorrowIsoDate();
        await searchPage.setCollectionDateRange(tomorrow);

        await expect(page.getByText('No data')).toBeVisible();
    });
});
