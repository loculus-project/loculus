import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

test.describe('Search advanced options', () => {
    test('should open advanced options modal with version status and revocation filters', async ({
        page,
    }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const rows = searchPage.getSequenceRows();
        await rows.first().waitFor();

        const advancedButton = page.getByRole('button', { name: 'Advanced options' });
        await expect(advancedButton).toBeEnabled();
        await advancedButton.click();

        await expect(page.getByRole('heading', { name: 'Advanced options' })).toBeVisible();
        await expect(page.getByText('Version status')).toBeVisible();
        await expect(page.getByText('Is revocation')).toBeVisible();
    });

    test('should close advanced options modal with Close button', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const rows = searchPage.getSequenceRows();
        await rows.first().waitFor();

        const advancedButton = page.getByRole('button', { name: 'Advanced options' });
        await expect(advancedButton).toBeEnabled();
        await advancedButton.click();

        await expect(page.getByRole('heading', { name: 'Advanced options' })).toBeVisible();

        // Use the text-based Close button (not the X icon)
        await page.getByRole('button', { name: 'Close' }).last().click();
        await expect(page.getByRole('heading', { name: 'Advanced options' })).not.toBeVisible();
    });
});
