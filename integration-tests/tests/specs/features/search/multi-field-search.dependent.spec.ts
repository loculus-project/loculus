import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';
import fs from 'fs';

test.describe('Multi-field search', () => {
    let searchPage: SearchPage;

    test.beforeEach(({ page }) => {
        searchPage = new SearchPage(page);
    });

    test('searches by identifier and contributor fields, verifies URL params, and downloads', async ({
        page,
        browserName,
    }) => {
        test.skip(
            browserName === 'webkit',
            'WebKit raises a native warning that blocks the download',
        );

        await searchPage.ebolaSudan();
        await searchPage.waitForSequencesInSearch(3);

        // Search using identifier field (matches submissionId 'foobar-readonly-*')
        const identifierField = page.getByRole('textbox', { name: 'Identifier', exact: true });
        await identifierField.fill('foobar-readonly');
        await identifierField.press('Enter');
        await page.waitForTimeout(500);

        // Verify URL contains identifier parameter
        let urlParams = new URL(page.url()).searchParams;
        expect(urlParams.get('identifier')).toBe('foobar-readonly');

        // Should still show all 3 sequences (all have foobar-readonly-* submissionId)
        await expect(page.getByText(/Search returned 3 sequence/)).toBeVisible();

        // Now also search using contributor field (matches authorAffiliations 'Patho Institute, Paris')
        const contributorField = page.getByRole('textbox', { name: 'Contributor', exact: true });
        await contributorField.fill('Paris');
        await contributorField.press('Enter');
        await page.waitForTimeout(500);

        // Verify URL contains both parameters
        urlParams = new URL(page.url()).searchParams;
        expect(urlParams.get('identifier')).toBe('foobar-readonly');
        expect(urlParams.get('contributor')).toBe('Paris');

        // Should now show only 1 sequence (the one from Paris)
        await expect(page.getByText(/Search returned 1 sequence/)).toBeVisible();

        // Verify the active filter chips are displayed
        await expect(page.getByText(/Identifier:\s*foobar-readonly/)).toBeVisible();
        await expect(page.getByText(/Contributor:\s*Paris/)).toBeVisible();

        // Test the download functionality with the filtered results
        await page.getByRole('button', { name: 'Download all entries' }).click();
        await page.getByLabel('I agree to the data use terms.').check();

        const downloadPromise = page.waitForEvent('download');
        await page.getByTestId('start-download').click();
        const download = await downloadPromise;

        const downloadPath = await download.path();
        expect(downloadPath).toBeTruthy();

        // Verify downloaded file contains exactly 1 sequence (header + 1 data row)
        const fileContent = fs.readFileSync(downloadPath, 'utf8');
        const lines = fileContent.split('\n').filter((line) => line.trim() !== '');
        expect(lines).toHaveLength(2); // header + 1 data row
    });

    test('identifier filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();

        const identifierField = page.getByRole('textbox', { name: 'Identifier', exact: true });
        await identifierField.fill('foobar');
        await identifierField.press('Enter');
        await page.waitForTimeout(500);

        await expect(page.getByText(/Identifier:\s*foobar/)).toBeVisible();

        // Remove the filter by clicking the X
        const filterChip = page.locator('text=/Identifier:\\s*foobar/').locator('..');
        await filterChip.getByRole('button').click();

        await expect(page.getByText(/Identifier:\s*foobar/)).toBeHidden();
        await expect(identifierField).toHaveValue('');

        // Verify the URL no longer contains the identifier param
        const urlParams = new URL(page.url()).searchParams;
        expect(urlParams.has('identifier')).toBe(false);
    });

    test('contributor filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();

        const contributorField = page.getByRole('textbox', { name: 'Contributor', exact: true });
        await contributorField.fill('Institute');
        await contributorField.press('Enter');
        await page.waitForTimeout(500);

        await expect(page.getByText(/Contributor:\s*Institute/)).toBeVisible();

        // Remove the filter by clicking the X
        const filterChip = page.locator('text=/Contributor:\\s*Institute/').locator('..');
        await filterChip.getByRole('button').click();

        await expect(page.getByText(/Contributor:\s*Institute/)).toBeHidden();
        await expect(contributorField).toHaveValue('');

        // Verify the URL no longer contains the contributor param
        const urlParams = new URL(page.url()).searchParams;
        expect(urlParams.has('contributor')).toBe(false);
    });
});
