import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

test.describe('Search Tools / Link-out menu', () => {
    test('should display Tools dropdown with external analysis links', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const rows = searchPage.getSequenceRows();
        await rows.first().waitFor();

        // Click the Tools button to open the link-out menu
        const toolsButton = page.getByRole('button', { name: /Tools/ });
        await expect(toolsButton).toBeEnabled();
        await toolsButton.click();

        // Should show analysis option text and a Nextclade entry
        await expect(page.getByText(/Analyze \d+ sequences with:/)).toBeVisible();
        // The link-out items are rendered as Button components inside HeadlessUI MenuItems
        await expect(page.getByText('Nextclade')).toBeVisible();
    });

    test('should update sequence count in Tools menu after filtering', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const rows = searchPage.getSequenceRows();
        await rows.first().waitFor();

        // Get total count from header
        const totalText = await page.getByText(/Search returned \d+ sequence/).innerText();
        const totalMatch = totalText.match(/(\d+)/);
        const totalCount = totalMatch ? Number.parseInt(totalMatch[1]) : 0;

        // Apply a filter to reduce results
        await searchPage.select('Collection country', 'France');
        await page.waitForTimeout(1000);

        const filteredText = await page.getByText(/Search returned \d+ sequence/).innerText();
        const filteredMatch = filteredText.match(/(\d+)/);
        const filteredCount = filteredMatch ? Number.parseInt(filteredMatch[1]) : 0;

        expect(filteredCount).toBeLessThan(totalCount);

        // Open Tools menu and verify it reflects the filtered count
        const toolsButton = page.getByRole('button', { name: /Tools/ });
        await expect(toolsButton).toBeEnabled();
        await toolsButton.click();
        await expect(
            page.getByText(new RegExp(`Analyze ${filteredCount} sequences with:`)),
        ).toBeVisible();
    });
});
