import { expect, Locator } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

const ACCESSION_PATTERN = /LOC_[A-Z0-9]+\.[0-9]+/;

test.describe('Accession search functionality', () => {
    let searchPage: SearchPage;

    test.beforeEach(({ page }) => {
        searchPage = new SearchPage(page);
    });

    async function extractAccessions(rows: Locator, count: number): Promise<string[]> {
        const accessions: string[] = [];
        const rowCount = await rows.count();

        for (let i = 0; i < Math.min(count, rowCount); i++) {
            const rowText = await rows.nth(i).innerText();
            const match = rowText.match(ACCESSION_PATTERN);
            if (match) {
                accessions.push(match[0]);
            }
        }

        return accessions;
    }

    test('should search for a single sequence by accession and click it', async ({ page }) => {
        await searchPage.ebolaSudan();

        const accessionVersion = await searchPage.waitForLoculusId();
        expect(accessionVersion).toBeTruthy();

        await searchPage.enterAccessions(accessionVersion);
        await searchPage.expectSequenceCount(1);

        const accessionLink = page.getByRole('link', { name: accessionVersion });
        await expect(accessionLink).toBeVisible();
        await accessionLink.click();

        await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();
    });

    test('should search for multiple sequences by accession using various delimiters', async ({
        page,
    }) => {
        await searchPage.ebolaSudan();

        const rows = searchPage.getSequenceRows();
        await rows.first().waitFor();

        const accessions = await extractAccessions(rows, 3);
        expect(accessions.length).toBeGreaterThanOrEqual(3);

        const query = `doesnotexist\n${accessions[0]},${accessions[1]}\t${accessions[2]}`;
        await searchPage.enterAccessions(query);

        await page.waitForTimeout(1000);
        await searchPage.expectSequenceCount(3);

        for (const accession of accessions) {
            await expect(page.getByRole('link', { name: accession })).toBeVisible();
        }
    });

    test('should handle large accession queries with many invalid entries', async ({ page }) => {
        test.setTimeout(60000);

        await searchPage.ebolaSudan();

        const rows = searchPage.getSequenceRows();
        await rows.first().waitFor();

        const accessions = await extractAccessions(rows, 3);
        expect(accessions.length).toBeGreaterThanOrEqual(3);

        let query = `doesnotexist\n${accessions[0]},${accessions[1]}\t${accessions[2]}`;
        for (let i = 0; i < 1000; i++) {
            query += `\ndoesnotexist${i}`;
        }

        await searchPage.enterAccessions(query);
        await page.waitForTimeout(1500);

        await searchPage.expectSequenceCount(3);

        for (const accession of accessions) {
            await expect(page.getByRole('link', { name: accession })).toBeVisible();
        }
    });

    test('should search by accession and display correct metadata in results', async () => {
        await searchPage.ebolaSudan();

        const accessionVersion = await searchPage.waitForLoculusId();
        expect(accessionVersion).toBeTruthy();

        await searchPage.enterAccessions(accessionVersion);
        await searchPage.expectSequenceCount(1);

        const rows = searchPage.getSequenceRows();
        await expect(rows.first()).toBeVisible();

        const rowText = await rows.first().innerText();
        expect(rowText).toContain(accessionVersion);
    });

    test('should clear accession search when reset button is clicked', async ({ page }) => {
        await searchPage.ebolaSudan();

        const accessionVersion = await searchPage.waitForLoculusId();
        expect(accessionVersion).toBeTruthy();

        await searchPage.enterAccessions(accessionVersion);
        await searchPage.expectSequenceCount(1);

        const accessionField = page.getByRole('textbox', { name: 'Accession', exact: true });
        await expect(accessionField).toHaveValue(accessionVersion);

        await searchPage.resetSearchForm();

        await expect(accessionField).toHaveValue('');

        const rows = searchPage.getSequenceRows();
        const rowCount = await rows.count();
        expect(rowCount).toBeGreaterThan(1);
    });
});
