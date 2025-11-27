import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../pages/search.page';
import { SequenceDetailPage } from '../../pages/sequence-detail.page';

test.describe('Sequence detail page', () => {
    test('can view sequence data on the detail page', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        // Get an accession from search results
        const accessionVersion = await searchPage.waitForLoculusId();
        expect(accessionVersion).toBeTruthy();

        // Navigate to the full sequence detail page
        const detailPage = new SequenceDetailPage(page);
        await detailPage.goto(accessionVersion);

        await detailPage.loadSequencesIfNeeded();
        await detailPage.waitForSequenceTabs();
        await detailPage.selectUnalignedTab();
        await detailPage.expectSequenceContentVisible();
    });
});
