import { expect, test } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';

test.describe('Sequence Preview Annotations', () => {
    let searchPage: SearchPage;

    test.beforeEach(async ({ page }) => {
        searchPage = new SearchPage(page);
    });

    test('should have an embl file in the Files section', async ({ page }) => {
        await searchPage.ebolaSudan();

        await searchPage.clickOnSequence(0);

        await expect(page.getByTestId('sequence-preview-modal')).toBeVisible();

        await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
        await expect(
            page.getByTestId('sequence-preview-modal').getByText('Annotations'),
        ).toBeVisible();
        await expect(page.getByRole('link', { name: /LOC_\w{6,9}\.embl/ })).toBeVisible();

        const fileUrl = await page.getByRole('link', { name: /LOC_\w{6,9}\.embl/ }).getAttribute('href');

        await Promise.all([
            page.waitForResponse(
                async (resp) => resp.status() === 200 && (await resp.text()).startsWith('ID   LOC_'),
            ),
            page.evaluate((url) => fetch(url), fileUrl),
        ]);
    });
});
