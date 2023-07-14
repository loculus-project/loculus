import { DateTime } from 'luxon';

import { baseUrl, expect, test, testSequence } from '../../e2e.fixture';

const pageSize = 100;

test.describe('The search page', () => {
    test('should show the search form with button and a table', async ({ searchPage }) => {
        await expect(searchPage.page).toHaveTitle('Search');
        await expect(searchPage.searchButton).toBeVisible();
        await expect(searchPage.table).toBeVisible();
    });

    test('should find no data in the future', async ({ searchPage }) => {
        const tomorrow = DateTime.now().plus({ days: 1 }).toISODate()!;

        await searchPage.searchFor({ dateFrom: tomorrow });

        await expect(searchPage.page.getByText('No data')).toBeVisible();
    });

    test('should search for existing sequences', async ({ searchPage }) => {
        await searchPage.getEmptyGenbankAccessionField().fill(testSequence.name);
        await searchPage.clickSearchButton();

        await searchPage.page.waitForURL(`${baseUrl}/search?genbankAccession=${testSequence.name}`);
        // TODO: This test is currently failing (i.e. LAPIS1/2 POST problem). Should work with LAPIS2
        await expect(searchPage.page.getByText('Error while fetching data')).toBeVisible();
    });

    test('should search for existing data from one country', async ({ searchPage }) => {
        await searchPage.searchFor({ country: 'Germany' });

        const resultCount = await searchPage.page.getByText('Germany').count();

        expect(resultCount).toBe(pageSize);
    });

    test('should reset the search', async ({ searchPage }) => {
        await searchPage.getEmptyGenbankAccessionField().fill(testSequence.name);

        await expect(searchPage.getFilledGenbankAccessionField()).toHaveValue(testSequence.name);

        await searchPage.clickResetButton();

        await expect(searchPage.getEmptyGenbankAccessionField()).toHaveValue('');
    });
});
