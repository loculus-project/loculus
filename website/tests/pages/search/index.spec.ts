import { type Page, type Download } from '@playwright/test';
import { DateTime } from 'luxon';

import { expect, test } from '../../e2e.fixture';

interface PerformDownloadOptions {
    selectRawNucleotide?: boolean;
}

test.describe('The search page', () => {
    test('should find no data in the future', async ({ searchPage }) => {
        const tomorrow = DateTime.now().plus({ days: 1 }).toISODate();

        await searchPage.goto();
        await searchPage.searchFor([{ name: 'dateFrom', filterValue: tomorrow }]);

        await expect(searchPage.page.getByText('No data')).toBeVisible();
    });

    test('should search for existing data from one country', async ({ searchPage }) => {
        await searchPage.goto();
        await searchPage.searchFor([{ name: 'country', filterValue: 'Switzerland' }]);

        await searchPage.page.locator('tr').first().waitFor();
        const rowLocator = searchPage.page.locator('tr').getByText('Switzerland');
        const rowCount = await rowLocator.count();
        expect(rowCount).toBeGreaterThan(0);
    });

    async function performDownload(page: Page, options: PerformDownloadOptions = {}): Promise<string> {
        const { selectRawNucleotide = false } = options;

        const downloadButton = page.getByRole('button', { name: 'Download' });
        await downloadButton.click();

        if (selectRawNucleotide) {
            const rawNucleotideRadio = page.getByLabel('Raw nucleotide sequences');
            await rawNucleotideRadio.check();
        }

        const agreeCheckbox = page.getByLabel(/I agree/);
        await agreeCheckbox.check();

        const downloadButton2 = page.getByTestId('start-download');

        const downloadPromise: Promise<Download> = page.waitForEvent('download');

        await downloadButton2.click();

        const download: Download = await downloadPromise;

        const suggestedFileName: string = download.suggestedFilename();
        const filePath: string = '/tmp/' + String(Math.random()).slice(0, 5) + suggestedFileName;
        await download.saveAs(filePath);

        return filePath;
    }

    test('should download file when agreeing to terms', async ({ searchPage, page, browserName }) => {
        test.skip(browserName === 'webkit', 'Download tests are skipped on WebKit');
        await searchPage.goto();

        const filePath = await performDownload(page);

        expect(filePath).toBeTruthy();
    });

    test('should download raw nucleotide sequences when selected', async ({ searchPage, page, browserName }) => {
        test.skip(browserName === 'webkit', 'Download tests are skipped on WebKit');
        await searchPage.goto();

        const filePath = await performDownload(page, { selectRawNucleotide: true });

        expect(filePath).toBeTruthy();
    });
});
