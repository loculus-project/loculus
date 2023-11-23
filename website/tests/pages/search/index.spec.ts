import { DateTime } from 'luxon';

import { routes } from '../../../src/routes.ts';
import { baseUrl, dummyOrganism, expect, test, testSequence } from '../../e2e.fixture';

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

    test('should search for existing sequence entries', async ({ searchPage }) => {
        await searchPage.goto();
        await searchPage.getEmptyAccessionVersionField().fill(testSequence.name);
        await searchPage.clickSearchButton();

        await searchPage.page.waitForURL(
            `${baseUrl}${routes.searchPage(dummyOrganism, [
                { name: 'accessionVersion', type: 'string', filterValue: testSequence.name },
                { name: 'isRevocation', type: 'string', filterValue: 'false' },
            ])}`,
        );
        await expect(searchPage.page.getByText(testSequence.name, { exact: true })).toBeVisible();
        await expect(searchPage.page.getByText('2002-12-15')).toBeVisible();
        await expect(searchPage.page.getByText('B.1.1.7')).toBeVisible();
    });

    test('should search for existing data from one country', async ({ searchPage }) => {
        await searchPage.goto();
        await searchPage.searchFor({ country: 'Switzerland' });

        const resultCount = await searchPage.page.getByText('Switzerland').count();

        expect(resultCount).toBeGreaterThan(0);
    });

    test('should reset the search', async ({ searchPage }) => {
        await searchPage.goto();
        await searchPage.getEmptyAccessionVersionField().fill(testSequence.name);

        await expect(searchPage.getFilledAccessionVersionField()).toHaveValue(testSequence.name);

        await searchPage.clickResetButton();

        await expect(searchPage.getEmptyAccessionVersionField()).toHaveValue('');
    });
});
