import { DateTime } from 'luxon';

import { routes } from '../../../src/routes/routes.ts';
import { getAccessionVersionString } from '../../../src/utils/extractAccessionVersion.ts';
import { baseUrl, dummyOrganism, expect, test } from '../../e2e.fixture';
import { getTestSequences } from '../../util/testSequenceProvider.ts';

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
        await expect(rowLocator.getByText('B.1.1.7')).toBeVisible();

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

    async function performDownload(page, options = {}) {
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

        // Set up a listener for the download event
        const downloadPromise = page.waitForEvent('download');

        await downloadButton2.click();

        const download = await downloadPromise;

        const suggestedFileName = download.suggestedFilename();
        const filePath = '/tmp/'+ String(Math.random()).slice(0,5) + suggestedFileName;
        await download.saveAs(filePath);

        return filePath;
    }

    test('should download file when agreeing to terms', async ({ searchPage, page }) => {
        await searchPage.goto();

        const filePath = await performDownload(page);

        // Add assertions to verify the downloaded file if needed
        expect(filePath).toBeTruthy();
    });

    test('should download raw nucleotide sequences when selected', async ({ searchPage, page }) => {
        await searchPage.goto();

        const filePath = await performDownload(page, { selectRawNucleotide: true });

        // Add assertions to verify the downloaded file contains raw nucleotide sequences
        expect(filePath).toBeTruthy();
        // Additional assertions can be added here to check the file content
    });
});
