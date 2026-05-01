import { test } from '../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../pages/search.page';
import { SequenceDetailPage } from '../../pages/sequence-detail.page';

test.describe('Sequence detail page', () => {
    test('can view unaligned sequence data on the detail page', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        // Get an accession from search results
        const accessionVersions = await searchPage.waitForSequencesInSearch(1);
        const { accessionVersion } = accessionVersions[0];

        // Navigate to the full sequence detail page
        const detailPage = new SequenceDetailPage(page);
        await detailPage.goto(accessionVersion);

        await detailPage.waitForSequenceTabs();
        await detailPage.selectUnalignedTab();
        await detailPage.expectSequenceContentVisible();
    });

    test('can view aligned sequence data on the detail page', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        // Get an accession from search results
        const accessionVersions = await searchPage.waitForSequencesInSearch(1);
        const { accessionVersion } = accessionVersions[0];

        // Navigate to the full sequence detail page
        const detailPage = new SequenceDetailPage(page);
        await detailPage.goto(accessionVersion);

        await detailPage.waitForSequenceTabs();
        await detailPage.selectAlignedTab();
        await detailPage.expectSequenceContentVisible();
    });
});
