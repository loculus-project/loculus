import { DateTime } from 'luxon';

import { routes } from '../../../src/routes.ts';
import { pageSize } from '../../../src/settings.ts';
import { baseUrl, expect, test, testSequence } from '../../e2e.fixture';

test.describe('The search page', () => {
    test('should show the search form with button and a table', async ({ searchPage }) => {
        await searchPage.goto();
        await expect(searchPage.page).toHaveTitle('Search');
        await expect(searchPage.searchButton).toBeVisible();
        await expect(searchPage.table).toBeVisible();
    });

    test('should find no data in the future', async ({ searchPage }) => {
        const tomorrow = DateTime.now().plus({ days: 1 }).toISODate()!;

        await searchPage.goto();
        await searchPage.searchFor({ dateFrom: tomorrow });

        await expect(searchPage.page.getByText('No data')).toBeVisible();
    });

    test('should search for existing sequences', async ({ searchPage }) => {
        await searchPage.goto();
        await searchPage.getEmptyAccessionField().fill(testSequence.name);
        await searchPage.clickSearchButton();

        await searchPage.page.waitForURL(
            `${baseUrl}${routes.searchPage([{ name: 'accession', type: 'string', filter: testSequence.name }])}`,
        );
        await expect(searchPage.page.getByText(testSequence.name)).toBeVisible();
        await expect(searchPage.page.getByText('2021-01-16')).toBeVisible();
        await expect(searchPage.page.getByText('B.1.221')).toBeVisible();
    });

    test('should search for existing data from one country', async ({ searchPage }) => {
        await searchPage.goto();
        await searchPage.searchFor({ country: 'Switzerland' });

        const resultCount = await searchPage.page.getByText('Switzerland').count();

        expect(resultCount).toBe(pageSize);
    });

    test('should reset the search', async ({ searchPage }) => {
        await searchPage.goto();
        await searchPage.getEmptyAccessionField().fill(testSequence.name);

        await expect(searchPage.getFilledAccessionField()).toHaveValue(testSequence.name);

        await searchPage.clickResetButton();

        await expect(searchPage.getEmptyAccessionField()).toHaveValue('');
    });
});
