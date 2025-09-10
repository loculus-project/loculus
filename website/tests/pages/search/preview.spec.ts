import { routes } from '../../../src/routes/routes.ts';
import { getAccessionVersionString } from '../../../src/utils/extractAccessionVersion.ts';
import { baseUrl, dummyOrganism, expect, test } from '../../e2e.fixture';
import { getTestSequences } from '../../util/testSequenceProvider.ts';

 test.describe('sequence preview url handling', () => {
     test('updates url and back returns to search', async ({ searchPage, page }) => {
         const accessionVersion = getAccessionVersionString(getTestSequences().testSequenceEntry);

         await searchPage.goto();
         await searchPage.getAccessionField().click();
         await searchPage.getAccessionField().fill(accessionVersion);
         await searchPage.page.waitForURL(
             `${baseUrl}${routes.searchPage(dummyOrganism.key)}?accession=${accessionVersion}`,
         );

         const row = searchPage.page.locator('tbody tr').first();
         await row.locator('td').nth(2).click();

         await expect(searchPage.page.getByTestId('sequence-preview-modal')).toBeVisible();
         await expect(searchPage.page).toHaveURL(
             `${baseUrl}${routes.sequenceEntryDetailsPage(accessionVersion)}`,
         );

         await page.goBack();
         await expect(searchPage.page).toHaveURL(`${baseUrl}${routes.searchPage(dummyOrganism.key)}`);
     });
 });
