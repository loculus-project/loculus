import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

test.describe('Search filters', () => {
    test('should find no data in the future', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        // Get tomorrow's date in ISO format
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowISO = tomorrow.toISOString().split('T')[0];

        await searchPage.enableSearchFields('Collection date from');
        await searchPage.fill('Collection date from', tomorrowISO);

        await expect(page.getByText('No data')).toBeVisible();
    });

    test('should search one existing sequence entry by accession', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const loculusId = await searchPage.waitForLoculusId();
        expect(loculusId).toBeTruthy();

        if (loculusId) {
            await searchPage.enterAccessions(loculusId);

            const accessionLink = page.getByRole('link', { name: loculusId });
            await expect(accessionLink).toBeVisible();
            await expect(page.getByText('Search returned 1 sequence')).toBeVisible();

            await accessionLink.click();
            expect(page.url()).toContain('/seq/');
        }
    });

    test('should search a few sequence entries by accession', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        // Wait for sequences to load
        await searchPage.waitForLoculusId();

        // Get multiple accessions from the page
        const rows = searchPage.getSequenceRows();
        const rowCount = await rows.count();

        if (rowCount >= 3) {
            const accessions: string[] = [];
            for (let i = 0; i < 3; i++) {
                const rowText = await rows.nth(i).innerText();
                const match = rowText.match(/LOC_[A-Z0-9]+\.[0-9]+/);
                if (match) {
                    accessions.push(match[0]);
                }
            }

            // Search using comma and tab separated accessions
            const query = `doesnotexist\n${accessions[0]},${accessions[1]}\t${accessions[2]}`;
            await searchPage.enterAccessions(query);

            // Wait for results
            await page.waitForTimeout(1000);

            // Verify we got 3 results
            const resultRows = searchPage.getSequenceRows();
            const resultCount = await resultRows.count();
            expect(resultCount).toBe(3);

            // Verify all three accessions are present
            for (const accession of accessions) {
                await expect(page.getByRole('link', { name: accession })).toBeVisible();
            }
        }
    });

    test('should search many sequence entries by accession', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        // Wait for sequences to load
        await searchPage.waitForLoculusId();

        // Get multiple accessions from the page
        const rows = searchPage.getSequenceRows();
        const rowCount = await rows.count();

        if (rowCount >= 3) {
            const accessions: string[] = [];
            for (let i = 0; i < 3; i++) {
                const rowText = await rows.nth(i).innerText();
                const match = rowText.match(/LOC_[A-Z0-9]+\.[0-9]+/);
                if (match) {
                    accessions.push(match[0]);
                }
            }

            // Create query with many non-existent accessions
            let query = `doesnotexist\n${accessions[0]},${accessions[1]}\t${accessions[2]}`;
            for (let i = 0; i < 1000; i++) {
                query += `\ndoesnotexist${i}`;
            }
            await searchPage.enterAccessions(query);

            // Wait for results
            await page.waitForTimeout(1000);

            // Verify we still got only 3 results
            const resultRows = searchPage.getSequenceRows();
            const resultCount = await resultRows.count();
            expect(resultCount).toBe(3);

            // Verify all three valid accessions are present
            for (const accession of accessions) {
                await expect(page.getByRole('link', { name: accession })).toBeVisible();
            }
        }
    });

    test('should search for existing data from one country', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        await searchPage.select('Collection country', 'France');

        // Wait for results to load
        await page.waitForTimeout(1000);

        // Check that we have results with the selected country
        const resultRows = searchPage.getSequenceRows();
        const rowCount = await resultRows.count();
        expect(rowCount).toBeGreaterThan(0);

        // Verify country appears in the results
        await expect(page.locator('tr').getByText('France').first()).toBeVisible();
    });
});
