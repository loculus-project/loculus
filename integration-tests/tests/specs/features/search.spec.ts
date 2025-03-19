import { expect } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';
import { test } from '../../fixtures/sequence.fixture';
import { SingleSequenceSubmissionPage } from '../../pages/singlesubmission.page';

test.describe('Search', () => {
    let searchPage: SearchPage;

    test.beforeEach(async ({ pageWithReleasedSequence, page }) => {
        searchPage = new SearchPage(pageWithReleasedSequence);
    });

    test('test that search form resets when the reset button is clicked', async ({ page }) => {
        await searchPage.cchf();

        await searchPage.select("Collection country", "France");
        await expect(page.getByText('Collection Country:France')).toBeVisible();

        await searchPage.enterMutation('L:23T');
        await expect(page.getByText('nucleotideMutations:L:23T')).toBeVisible();

        await searchPage.resetSearchForm();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });

    test('test that filter can be removed by clicking the X', async ({ page, pageWithGroup }) => {
        await searchPage.cchf();
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
        await expect(page.getByText('nucleotideMutations:A23T')).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByText('nucleotideMutations:A23T')).not.toBeVisible();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });
});
