import { expect, test } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';

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

    test('test that filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();
        await searchPage.select('Collection country', 'France');
        await expect(page.getByText('Collection country:France')).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByText('Collection country:France')).not.toBeVisible();
        await expect(page.getByLabel('Collection country')).toBeEmpty();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });

    test('test that mutation filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();
        await searchPage.enterMutation('A23T');
        await expect(page.getByText('mutation:A23T')).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByText('mutation:A23T')).not.toBeVisible();
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
});
