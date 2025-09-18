import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

test.describe('Search by accession', () => {
    let searchPage: SearchPage;

    test.beforeEach(async ({ page }) => {
        searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();
    });

    test('shows no results when filtering by a future collection date', async ({ page }) => {
        const futureDate = '2100-01-01';
        await page.goto(`/ebola-sudan/search?sampleCollectionDateRangeLowerFrom=${futureDate}`);

        await expect(page.getByText('Search returned 0 sequences')).toBeVisible({ timeout: 30000 });
        await expect(searchPage.getSequenceRows()).toHaveCount(0, { timeout: 30000 });
    });

    test('finds a specific accession and opens its details', async ({ page }) => {
        await searchPage.resetSearchForm();

        const accession = await searchPage.getAccessionFromRow(0);
        await searchPage.enterAccessions(accession);

        await expect(page.getByText('Search returned 1 sequence')).toBeVisible();
        const accessionLink = page.getByRole('link', { name: accession });
        await expect(accessionLink).toBeVisible();

        await expect(searchPage.getSequenceRows().first()).toContainText(accession);

        await accessionLink.click();
        await expect(page.getByText('Amino acid mutations')).toBeVisible({ timeout: 30000 });
    });

    test('supports searching for multiple accessions at once', async ({ page }) => {
        await searchPage.resetSearchForm();

        const previousAccessions = await searchPage.getAccessions(3);
        const query = `doesnotexist\n${previousAccessions[0]},${previousAccessions[1]}\t${previousAccessions[2]}`;

        await searchPage.enterAccessions(query);
        await expect(page.getByText('Search returned 3 sequences')).toBeVisible({ timeout: 30000 });
        await expect(searchPage.getSequenceRows().nth(2)).toBeVisible({ timeout: 30000 });

        const newAccessions = await searchPage.getAccessions(3);
        expect(newAccessions).toHaveLength(3);
        expect(newAccessions).toEqual(expect.arrayContaining(previousAccessions));
    });

    test('ignores large numbers of invalid accessions', async ({ page }) => {
        await searchPage.resetSearchForm();

        const previousAccessions = await searchPage.getAccessions(3);
        let query = `doesnotexist\n${previousAccessions[0]},${previousAccessions[1]}\t${previousAccessions[2]}`;

        for (let index = 0; index < 100; index++) {
            query += `\ndoesnotexist${index}`;
        }

        await searchPage.enterAccessions(query);
        await expect(page.getByText('Search returned 3 sequences')).toBeVisible({ timeout: 30000 });
        await expect(searchPage.getSequenceRows().nth(2)).toBeVisible({ timeout: 30000 });

        const newAccessions = await searchPage.getAccessions(3);
        expect(newAccessions).toHaveLength(3);
        expect(newAccessions).toEqual(expect.arrayContaining(previousAccessions));
    });

    test('filters sequences by country', async ({ page }) => {
        await searchPage.resetSearchForm();
        const country = await searchPage.getCountryFromRow(0);

        await searchPage.select('Collection country', country);

        const countryRows = searchPage.getSequenceRows().filter({ hasText: country });
        await expect(countryRows.first()).toBeVisible({ timeout: 30000 });
        await expect(page.getByText(new RegExp(`Search returned .* sequence`))).toBeVisible({
            timeout: 30000,
        });
        const rowCount = await countryRows.count();
        expect(rowCount).toBeGreaterThan(0);
    });

    test('clears accession search criteria when reset', async ({ page }) => {
        await searchPage.resetSearchForm();

        const accession = await searchPage.getAccessionFromRow(0);
        const accessionField = page.getByRole('textbox', { name: 'Accession', exact: true });
        await accessionField.fill(accession);
        await expect(accessionField).toHaveValue(accession);

        await searchPage.resetSearchForm();
        await expect(accessionField).toHaveValue('');
    });
});
