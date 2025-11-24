import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../pages/search.page';

test.describe('Sequence detail page', () => {
    test('can view sequence data on the detail page', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        // Get an accession from search results
        const accessionVersion = await searchPage.waitForLoculusId();
        expect(accessionVersion).toBeTruthy();

        // Navigate to the full sequence detail page
        await page.goto(`/seq/${accessionVersion}`);

        // Verify we're on the sequence detail page by checking the heading
        await expect(page.getByRole('heading', { name: accessionVersion })).toBeVisible();

        // Click Load sequences button if present (may be auto-loaded)
        const loadButton = page.getByRole('button', { name: 'Load sequences' });
        if (await loadButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await loadButton.click();
        }

        // Verify sequence tabs are available (may be buttons or tabs)
        // The sequence section should have tabs for different sequence types
        const unalignedTab = page.getByRole('button', { name: /unaligned/i });
        const alignedTab = page.getByRole('button', { name: /aligned/i });

        // At least one of these should be visible
        await expect(unalignedTab.or(alignedTab).first()).toBeVisible({ timeout: 30000 });

        // Click on unaligned nucleotide sequences tab
        if (await unalignedTab.isVisible()) {
            await unalignedTab.click();
        }

        // Verify the sequence section is present and has content
        // The sequence display area should show some nucleotide content
        await expect(page.getByText(/[ACGTN]{20,}/)).toBeVisible({ timeout: 10000 });
    });
});
