import { DateTime } from 'luxon';

import { getAccessionVersionString } from '../../../src/utils/extractAccessionVersion.ts';
import { expect, test } from '../../e2e.fixture';
import { getTestSequences } from '../../util/testSequenceProvider.ts';

test.describe('The search page', () => {
    test('should find no data in the future', async ({ searchPage }) => {
        const tomorrow = DateTime.now().plus({ days: 1 }).toISODate();

        await searchPage.goto();
        await searchPage.searchFor([{ name: 'dateFrom', filterValue: tomorrow }]);

        await expect(searchPage.page.getByText('No data')).toBeVisible();
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
});
