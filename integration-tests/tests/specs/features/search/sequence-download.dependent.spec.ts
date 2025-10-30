import { expect, Download, Page } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

async function performSequenceDownload(page: Page, selectRawNucleotide = false): Promise<Download> {
    await page.getByRole('button', { name: 'Download' }).click();

    if (selectRawNucleotide) {
        await page.getByLabel('Raw nucleotide sequences').check();
    } else {
        await page.getByLabel('Aligned nucleotide sequences').check();
    }

    await page.getByLabel(/I agree/).check();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('start-download').click();

    return downloadPromise;
}

test.describe('Search sequence download functionality', () => {
    test('should download aligned sequences when agreeing to terms', async ({
        page,
        browserName,
    }) => {
        test.skip(browserName === 'webkit', 'Download tests are skipped on WebKit');

        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const download = await performSequenceDownload(page);

        const downloadPath = await download.path();
        expect(downloadPath).toBeTruthy();

        const suggestedFilename = download.suggestedFilename();
        expect(suggestedFilename).toBeTruthy();
        expect(suggestedFilename).toContain('fasta');
    });

    test('should download raw nucleotide sequences when selected', async ({
        page,
        browserName,
    }) => {
        test.skip(browserName === 'webkit', 'Download tests are skipped on WebKit');

        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const download = await performSequenceDownload(page, true);

        const downloadPath = await download.path();
        expect(downloadPath).toBeTruthy();

        const suggestedFilename = download.suggestedFilename();
        expect(suggestedFilename).toBeTruthy();
        expect(suggestedFilename).toContain('fasta');
    });

    test('should download sequences with custom filters applied', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'Download tests are skipped on WebKit');

        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        await searchPage.select('Collection country', 'France');

        const download = await performSequenceDownload(page);

        const downloadPath = await download.path();
        expect(downloadPath).toBeTruthy();
    });
});
