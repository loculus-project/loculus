import { expect, test } from '@playwright/test';
import { SearchPage } from '../../../pages/search.page';

test.describe('Search', () => {
    let searchPage: SearchPage;

    test.beforeEach(async ({ page }) => {
        searchPage = new SearchPage(page);
    });

    test('test that search form resets when the reset button is clicked', async ({ page }) => {
        await searchPage.ebolaSudan();

        await searchPage.select('Collection country', 'France');
        await searchPage.enterMutation('A23T');
        await expect.soft(page.getByText('Collection country:France')).toBeVisible();
        await expect.soft(page.getByText('mutation:A23T')).toBeVisible();

        await searchPage.resetSearchForm();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });

    test('test that hidden field values are kept in the URL params', async ({ page }) => {
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

    test('test that columns can be hidden via context menu', async ({ page }) => {
        await searchPage.ebolaSudan();

        // First verify that a column is visible
        await expect(page.getByRole('columnheader', { name: 'Collection Date' })).toBeVisible();

        // Right-click on the column header to hide it
        await page
            .getByRole('columnheader', { name: 'Collection Date' })
            .click({ button: 'right' });

        // Confirm the dialog
        await page.getByRole('dialog').getByText('OK').click();

        // Verify that the column is now hidden
        await expect(page.getByRole('columnheader', { name: 'Collection Date' })).not.toBeVisible();

        // Verify the URL parameter is updated
        const searchParams = new URL(page.url()).searchParams;
        expect(searchParams.has('column_collectionDate')).toBeTruthy();
        expect(searchParams.get('column_collectionDate')).toBe('false');
    });
});
