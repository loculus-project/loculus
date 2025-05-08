import { expect, test } from '@playwright/test';
import { SearchPage } from '../../../pages/search.page';

test.describe('Column Visibility', () => {
    let searchPage: SearchPage;

    test.beforeEach(async ({ page }) => {
        searchPage = new SearchPage(page);
    });

    test('should show possibly-visible columns and hide always-hidden ones in the customization modal', async ({ page }) => {
        await searchPage.navigateToVirus("Test Dummy Organism")
        await page.getByText('Customize columns').click();
        
        // Using testId pattern instead of text to be consistent with other tests
        await page.getByRole('checkbox', { name: 'Pango lineage' }).waitFor();
        await expect(page.getByRole('checkbox', { name: 'Pango lineage' })).toBeVisible();
        await expect(page.getByRole('checkbox', { name: 'Hidden Field' })).not.toBeVisible();
    });
});