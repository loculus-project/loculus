import { expect, type Page, type Download } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

test.describe('Search page additional functionality', () => {
    let searchPage: SearchPage;

    test.beforeEach(({ page }) => {
        searchPage = new SearchPage(page);
    });

    test('should find no data when searching for future date', async ({ page }) => {
        await searchPage.ebolaSudan();

        // Get tomorrow's date
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD format

        // Search for date from tomorrow onwards
        await searchPage.enableSearchFields('Collection date from');
        await searchPage.fill('Collection date from', tomorrowStr);

        await expect(page.getByText('No data')).toBeVisible();
    });

    test('should search for existing data from one country', async ({ page }) => {
        await searchPage.ebolaSudan();

        await searchPage.select('Collection country', 'France');

        // Wait for results to load
        await page.locator('tr').first().waitFor();
        const rowLocator = page.locator('tr').getByText('France');
        const rowCount = await rowLocator.count();
        expect(rowCount).toBeGreaterThan(0);
    });

    test('should search a few sequence entries by accession', async ({ page }) => {
        await searchPage.ebolaSudan();

        // Get first 3 accessions from the page
        const rows = searchPage.getSequenceRows();
        await expect(rows.first()).toBeVisible({ timeout: 10000 });

        const accessions: string[] = [];
        for (let i = 0; i < 3; i++) {
            const rowText = await rows.nth(i).innerText();
            const match = rowText.match(/LOC_[A-Z0-9]+\.[0-9]+/);
            if (match) {
                accessions.push(match[0]);
            }
        }

        expect(accessions.length).toBe(3);

        // Search with multiple accessions using different separators
        const query = `doesnotexist\n${accessions[0]},${accessions[1]}\t${accessions[2]}`;
        await searchPage.enterAccessions(query);

        // Wait for results
        await page.waitForTimeout(1000);

        // Verify we got the 3 sequences back
        await searchPage.expectSequenceCount(3);

        // Verify the accessions appear on the page
        for (const accession of accessions) {
            await expect(page.getByText(accession)).toBeVisible();
        }
    });

    test('should search many sequence entries by accession', async ({ page }) => {
        test.setTimeout(60000);
        await searchPage.ebolaSudan();

        // Get first 3 accessions from the page
        const rows = searchPage.getSequenceRows();
        await expect(rows.first()).toBeVisible({ timeout: 10000 });

        const accessions: string[] = [];
        for (let i = 0; i < 3; i++) {
            const rowText = await rows.nth(i).innerText();
            const match = rowText.match(/LOC_[A-Z0-9]+\.[0-9]+/);
            if (match) {
                accessions.push(match[0]);
            }
        }

        expect(accessions.length).toBe(3);

        // Create a query with many non-existent accessions plus the 3 real ones
        let query = `doesnotexist\n${accessions[0]},${accessions[1]}\t${accessions[2]}`;
        for (let i = 0; i < 1000; i++) {
            query += `\ndoesnotexist${i}`;
        }

        await searchPage.enterAccessions(query);

        // Wait for results
        await page.waitForTimeout(2000);

        // Should still get exactly 3 sequences
        await searchPage.expectSequenceCount(3);

        // Verify the accessions appear on the page
        for (const accession of accessions) {
            await expect(page.getByText(accession)).toBeVisible();
        }
    });

    async function performDownload(page: Page, selectRawNucleotide = false): Promise<string> {
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

    test('should download file when agreeing to terms', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'Download tests are skipped on WebKit');

        await searchPage.ebolaSudan();

        const filePath = await performDownload(page);

        expect(filePath).toBeTruthy();
    });

    test('should download raw nucleotide sequences when selected', async ({
        page,
        browserName,
    }) => {
        test.skip(browserName === 'webkit', 'Download tests are skipped on WebKit');

        await searchPage.ebolaSudan();

        const filePath = await performDownload(page, true);

        expect(filePath).toBeTruthy();
    });
});
