import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../pages/search.page';

test.describe('Header accession search', () => {
    test('should open search box when clicking the search icon in the navigation', async ({
        page,
    }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        // Click the search icon (magnifying glass) in the header
        // Desktop and mobile nav both have the button; use first visible one
        await page.getByLabel('Open accession search').click();

        // The "Search by accession" input should appear (desktop + mobile, use first)
        await expect(page.getByTestId('nav-accession-search-input').first()).toBeVisible();
    });

    test('should navigate to sequence detail when entering a valid accession', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        // Get an accession from search results
        const accessionVersions = await searchPage.waitForSequencesInSearch(1);
        const { accessionVersion } = accessionVersions[0];
        const accession = accessionVersion.split('.')[0];

        // Click the search icon in the header
        await page.getByLabel('Open accession search').click();

        // Use first visible search input (desktop)
        const searchBox = page.getByTestId('nav-accession-search-input').first();
        await searchBox.fill(accession);
        await searchBox.press('Enter');

        // Should navigate to the sequence detail page
        await expect(page.getByRole('heading', { name: new RegExp(accession) })).toBeVisible();
    });
});
