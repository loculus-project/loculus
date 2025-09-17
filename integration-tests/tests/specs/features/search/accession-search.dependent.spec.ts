import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

function getTomorrowDateIso(): string {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().slice(0, 10);
}

test.describe('Search by accession', () => {
    let searchPage: SearchPage;

    test.beforeEach(({ page }) => {
        searchPage = new SearchPage(page);
    });

    test('shows no data for future collection date', async ({ page }) => {
        await searchPage.ebolaSudan();

        const tomorrow = getTomorrowDateIso();
        const url = new URL(page.url());
        url.searchParams.set('sampleCollectionDateRangeLowerFrom', tomorrow);

        await page.goto(url.toString());

        await expect(page.getByText(/Search returned 0 sequences/)).toBeVisible();
        await expect(searchPage.getSequenceRows()).toHaveCount(0);
    });

    test('filters to a single accession and opens its details', async ({ page }) => {
        await searchPage.ebolaSudan();
        await expect(searchPage.getSequenceRows().first()).toBeVisible();

        const accessions = await searchPage.getAccessionValues(1);
        expect(accessions.length).toBeGreaterThan(0);

        const accession = accessions[0];
        await searchPage.enterAccessions(accession);

        await expect(page.getByRole('link', { name: accession })).toBeVisible();
        await page.getByRole('link', { name: accession }).click();
        await expect(page.getByText('Amino acid mutations')).toBeVisible();
    });

    test('filters multiple accession inputs at once', async () => {
        await searchPage.ebolaSudan();
        await expect(searchPage.getSequenceRows().first()).toBeVisible();

        const accessions = await searchPage.getAccessionValues(3);
        expect(accessions.length).toBeGreaterThanOrEqual(3);

        const query = `missing-${Date.now()}\n${accessions[0]},${accessions[1]}\t${accessions[2]}`;
        await searchPage.enterAccessions(query);

        await expect
            .poll(async () => {
                const results = await searchPage.getAccessionValues(3);
                return accessions.every((accession) => results.includes(accession));
            })
            .toBeTruthy();
    });

    test('handles large accession lists with noise', async () => {
        await searchPage.ebolaSudan();
        await expect(searchPage.getSequenceRows().first()).toBeVisible();

        const accessions = await searchPage.getAccessionValues(3);
        expect(accessions.length).toBeGreaterThanOrEqual(3);

        let query = `missing-${Date.now()}\n${accessions[0]},${accessions[1]}\t${accessions[2]}`;
        for (let index = 0; index < 1000; index++) {
            query += `\nmissing-${index}-${Date.now()}`;
        }

        await searchPage.enterAccessions(query);

        await expect
            .poll(async () => {
                const results = await searchPage.getAccessionValues(3);
                return accessions.every((accession) => results.includes(accession));
            })
            .toBeTruthy();
    });

    test('reset clears the accession filter', async () => {
        await searchPage.ebolaSudan();
        await expect(searchPage.getSequenceRows().first()).toBeVisible();

        const accessions = await searchPage.getAccessionValues(1);
        expect(accessions.length).toBeGreaterThan(0);

        const accession = accessions[0];
        await searchPage.enterAccessions(accession);

        const accessionField = searchPage.getAccessionField();
        await expect(accessionField).toHaveValue(accession);

        await searchPage.resetSearchForm();
        await expect(accessionField).toHaveValue('');
    });
});
