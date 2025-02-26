import { type Page, type Download } from '@playwright/test';
import { DateTime } from 'luxon';

import { routes } from '../../../src/routes/routes.ts';
import { getAccessionVersionString } from '../../../src/utils/extractAccessionVersion.ts';
import { baseUrl, dummyOrganism, expect, test } from '../../e2e.fixture';
import { getTestSequences } from '../../util/testSequenceProvider.ts';

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

    test('should search one existing sequence entry by accession, then click it', async ({ searchPage }) => {
        const testAccessionVersion = getAccessionVersionString(getTestSequences().testSequenceEntry);

        await searchPage.goto();
        await searchPage.getAccessionField().click();
        await searchPage.getAccessionField().fill(testAccessionVersion);

        await searchPage.page.waitForURL(
            `${baseUrl}${routes.searchPage(dummyOrganism.key)}?accession=${testAccessionVersion}`,
        );
        const accessionLink = searchPage.page.getByRole('link', { name: testAccessionVersion });
        searchPage.page.getByText('Search returned 1 sequence');
        await expect(accessionLink).toBeVisible();

        const rowLocator = searchPage.page.locator('tr');
        await expect(rowLocator.getByText('2002-12-15')).toBeVisible();
        await expect(rowLocator.getByText('A.1.1')).toBeVisible();

        await accessionLink.click();
        await expect(searchPage.page.getByText('Amino acid mutations')).toBeVisible({ timeout: 30000 });
    });

    test('should search a few sequence entries by accession', async ({ searchPage }) => {
        await searchPage.goto();
        const previousAccessions = await searchPage.getAccessions(3);

        const query = `doesnotexist\n${previousAccessions[0]},${previousAccessions[1]}\t${previousAccessions[2]}`;
        await searchPage.getAccessionField().click();
        await searchPage.getAccessionField().fill(query);

        const newAccessions = await searchPage.getAccessions(3);

        expect(newAccessions.length).toBe(3);
        expect(newAccessions.includes(previousAccessions[0])).toBeTruthy();
        expect(newAccessions.includes(previousAccessions[1])).toBeTruthy();
        expect(newAccessions.includes(previousAccessions[2])).toBeTruthy();
    });

    test('should search many sequence entries by accession', async ({ searchPage }) => {
        await searchPage.goto();
        const previousAccessions = await searchPage.getAccessions(3);

        let query = `doesnotexist\n${previousAccessions[0]},${previousAccessions[1]}\t${previousAccessions[2]}`;
        for (let i = 0; i < 1000; i++) {
            query += `\ndoesnotexist${i}`;
        }
        await searchPage.getAccessionField().click();
        await searchPage.getAccessionField().fill(query);

        const newAccessions = await searchPage.getAccessions(3);

        expect(newAccessions.length).toBe(3);
        expect(newAccessions.includes(previousAccessions[0])).toBeTruthy();
        expect(newAccessions.includes(previousAccessions[1])).toBeTruthy();
        expect(newAccessions.includes(previousAccessions[2])).toBeTruthy();
    });

    test('should search for existing data from one country', async ({ searchPage }) => {
        await searchPage.goto();
        await searchPage.searchFor([{ name: 'country', filterValue: 'Switzerland' }]);

        await searchPage.page.locator('tr').first().waitFor();
        const rowLocator = searchPage.page.locator('tr').getByText('Switzerland');
        const rowCount = await rowLocator.count();
        expect(rowCount).toBeGreaterThan(0);
    });

    test('should reset the search', async ({ searchPage }) => {
        await searchPage.goto();

        const testAccessionVersion = getAccessionVersionString(getTestSequences().testSequenceEntry);

        await searchPage.getAccessionField().click();

        await searchPage.getAccessionField().fill(testAccessionVersion);

        await expect(searchPage.getAccessionField()).toHaveValue(testAccessionVersion);

        await searchPage.clickResetButton();

        await expect(searchPage.getAccessionField()).toHaveValue('');
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

    test('should show visible columns and hide others in the customization modal', async ({ searchPage, page }) => {
        await searchPage.goto();
        await page.getByText('Customize columns').click();
        void page.getByText('Toggle the visibility of columns').waitFor();
        void expect(page.getByRole('checkbox', { name: 'Pango lineage' })).toBeVisible();
        void expect(page.getByRole('checkbox', { name: 'Hidden Field' })).not.toBeVisible();
    });

    test('should add selected sequence to URL when clicking a sequence', async ({ searchPage, page }) => {
        // Go to search page and click a sequence
        await searchPage.goto();
        const firstAccessionLink = page.locator('tr').nth(1).locator('a').first();
        const accessionId = await firstAccessionLink.textContent();

        // Click to show the sequence preview modal
        await firstAccessionLink.click();

        // Wait for the modal to appear
        await expect(page.getByText('Amino acid mutations')).toBeVisible({ timeout: 30000 });

        // Verify URL contains the selectedSeq parameter
        await expect(page).toHaveURL(new RegExp(`selectedSeq=${accessionId}`));
    });

    test('should add halfScreen parameter to URL when toggling view mode', async ({ searchPage, page }) => {
        // Go to search page and click a sequence
        await searchPage.goto();
        const firstAccessionLink = page.locator('tr').nth(1).locator('a').first();
        await firstAccessionLink.click();

        // Wait for the modal to appear
        await expect(page.getByText('Amino acid mutations')).toBeVisible({ timeout: 30000 });

        // Click the dock button (halfScreen toggle)
        await page.getByTitle('Dock sequence details view').click();

        // Verify URL contains the halfScreen parameter
        await expect(page).toHaveURL(/halfScreen=true/);

        // Toggle back to full screen
        await page.getByTitle('Expand sequence details view').click();

        // Verify halfScreen parameter is removed from URL
        await expect(page).not.toHaveURL(/halfScreen/);
    });

    test('should restore state from URL parameters', async ({ searchPage, page }) => {
        // Get a valid sequence ID first by using the searchPage fixture
        await searchPage.goto();

        // Get the first accession ID
        const accessions = await searchPage.getAccessions(1);
        const accessionId = accessions[0];

        // Go directly to a URL with parameters
        await page.goto(`${baseUrl}${routes.searchPage(dummyOrganism.key)}?selectedSeq=${accessionId}&halfScreen=true`);

        // Verify the sequence preview is shown and in half-screen mode
        await expect(page.getByText('Amino acid mutations')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTitle('Expand sequence details view')).toBeVisible();
    });
});
