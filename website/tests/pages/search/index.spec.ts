import { DateTime } from 'luxon';

import { routes } from '../../../src/routes.ts';
import { getAccessionVersionString } from '../../../src/utils/extractAccessionVersion.ts';
import { baseUrl, dummyOrganism, expect, test } from '../../e2e.fixture';
import { getTestSequences } from '../../util/testSequenceProvider.ts';

test.describe('The search page', () => {
    test('should show the search form with button and a table', async ({ searchPage }) => {
        await searchPage.goto();
        await expect(searchPage.searchButton).toBeVisible();
        await expect(searchPage.table).toBeVisible();
    });

    test('should find no data in the future', async ({ searchPage }) => {
        const tomorrow = DateTime.now().plus({ days: 1 }).toISODate();

        await searchPage.goto();
        await searchPage.searchFor([{ name: 'dateFrom', filterValue: tomorrow }]);

        await expect(searchPage.page.getByText('No data')).toBeVisible();
    });

    test('should search one existing sequence entry by accession', async ({ searchPage }) => {
        const testAccessionVersion = getAccessionVersionString(getTestSequences().testSequenceEntry);

        await searchPage.goto();
        await searchPage.getEmptyAccessionField().fill(testAccessionVersion);
        await searchPage.clickSearchButton();

        await searchPage.page.waitForURL(
            `${baseUrl}${routes.searchPage(dummyOrganism.key, [
                {
                    name: 'accession',
                    type: 'string',
                    filterValue: getTestSequences().testSequenceEntry.accession,
                },
            ])}`,
        );
        await expect(searchPage.page.getByText(testAccessionVersion, { exact: true })).toBeVisible();
        await expect(searchPage.page.getByText('2002-12-15')).toBeVisible();
        await expect(searchPage.page.getByText('B.1.1.7')).toBeVisible();
    });

    test('should search a few sequence entries by accession', async ({ searchPage }) => {
        await searchPage.goto();
        const previousAccessions = (await searchPage.getTableContent()).map((arr) => arr[0]);

        const query = `doesnotexist\n${previousAccessions[0]},${previousAccessions[1]}\t${previousAccessions[2]}`;
        await searchPage.getEmptyAccessionField().fill(query);
        await searchPage.clickSearchButton();

        const newAccessions = (await searchPage.getTableContent()).map((arr) => arr[0]);

        expect(newAccessions.length).toBe(3);
        expect(newAccessions.includes(previousAccessions[0])).toBeTruthy();
        expect(newAccessions.includes(previousAccessions[1])).toBeTruthy();
        expect(newAccessions.includes(previousAccessions[2])).toBeTruthy();
    });

    test('should search many sequence entries by accession', async ({ searchPage }) => {
        await searchPage.goto();
        const previousAccessions = (await searchPage.getTableContent()).map((arr) => arr[0]);

        let query = `doesnotexist\n${previousAccessions[0]},${previousAccessions[1]}\t${previousAccessions[2]}`;
        for (let i = 0; i < 1000; i++) {
            query += `\ndoesnotexist${i}`;
        }
        await searchPage.getEmptyAccessionField().fill(query);
        await searchPage.clickSearchButton();

        const newAccessions = (await searchPage.getTableContent()).map((arr) => arr[0]);

        expect(newAccessions.length).toBe(3);
        expect(newAccessions.includes(previousAccessions[0])).toBeTruthy();
        expect(newAccessions.includes(previousAccessions[1])).toBeTruthy();
        expect(newAccessions.includes(previousAccessions[2])).toBeTruthy();
    });

    test('should search for existing data from one country', async ({ searchPage }) => {
        await searchPage.goto();
        await searchPage.searchFor([{ name: 'country', filterValue: 'Switzerland' }]);

        const resultCount = await searchPage.page.getByText('Switzerland').count();

        expect(resultCount).toBeGreaterThan(0);
    });

    test('should reset the search', async ({ searchPage }) => {
        await searchPage.goto();

        const testAccessionVersion = getAccessionVersionString(getTestSequences().testSequenceEntry);
        await searchPage.getEmptyAccessionField().fill(testAccessionVersion);

        await expect(searchPage.getFilledAccessionField()).toHaveValue(testAccessionVersion);

        await searchPage.clickResetButton();

        await expect(searchPage.getEmptyAccessionField()).toHaveValue('');
    });
});
