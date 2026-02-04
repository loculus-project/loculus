import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

test.describe('Column Visibility', () => {
    let searchPage: SearchPage;

    test.beforeEach(({ page }) => {
        searchPage = new SearchPage(page);
    });

    test('should show possibly-visible columns and hide always-hidden ones in the customization modal', async ({
        page,
    }) => {
        await searchPage.navigateToVirus('Ebola Sudan');
        await page.getByText('Customize columns').click();

        // Collection country is a visible column
        await page.getByRole('checkbox', { name: 'Collection country' }).waitFor();
        await expect(page.getByRole('checkbox', { name: 'Collection country' })).toBeVisible();
        // Collection date (lower bound) has hideInSearchResultsTable: true so should be hidden
        await expect(
            page.getByRole('checkbox', { name: 'Collection date (lower bound)' }),
        ).toBeHidden();
    });
});
