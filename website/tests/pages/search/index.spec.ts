import { DateTime } from 'luxon';

import { expect, test } from '../../e2e.fixture';

test.describe('The search page', () => {
    test('should find no data in the future', async ({ searchPage }) => {
        const tomorrow = DateTime.now().plus({ days: 1 }).toISODate();

        await searchPage.goto();
        await searchPage.searchFor([{ name: 'dateFrom', filterValue: tomorrow }]);

        await expect(searchPage.page.getByText('No data')).toBeVisible();
    });
});
