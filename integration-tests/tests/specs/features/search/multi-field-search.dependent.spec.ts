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

        const identifierField = page.getByRole('textbox', { name: 'Identifier', exact: true });
        await identifierField.fill('foobar-readonly');
        await identifierField.press('Enter');
        await page.waitForFunction(
            () =>
                new URL(window.location.href).searchParams.get('identifier') === 'foobar-readonly',
        );

        let urlParams = new URL(page.url()).searchParams;
        expect(urlParams.get('identifier')).toBe('foobar-readonly');
        await expect(page.getByText(/Search returned 3 sequence/)).toBeVisible();

        const contributorField = page.getByRole('textbox', { name: 'Contributor', exact: true });
        await contributorField.fill('Paris');
        await contributorField.press('Enter');
        await page.waitForFunction(
            () => new URL(window.location.href).searchParams.get('contributor') === 'Paris',
        );

        urlParams = new URL(page.url()).searchParams;
        expect(urlParams.get('identifier')).toBe('foobar-readonly');
        expect(urlParams.get('contributor')).toBe('Paris');
        await expect(page.getByText(/Search returned 1 sequence/)).toBeVisible();

        await expect(page.getByText(/Identifier:\s*foobar-readonly/)).toBeVisible();
        await expect(page.getByText(/Contributor:\s*Paris/)).toBeVisible();

        await page.getByRole('button', { name: 'Download all entries' }).click();
        await page.getByLabel('I agree to the data use terms.').check();

        const downloadPromise = page.waitForEvent('download');
        await page.getByTestId('start-download').click();
        const download = await downloadPromise;

        const downloadPath = await download.path();
        expect(downloadPath).toBeTruthy();

        const fileContent = fs.readFileSync(downloadPath, 'utf8');
        const lines = fileContent.split('\n').filter((line) => line.trim() !== '');
        expect(lines.length).toBeGreaterThanOrEqual(2);
        expect(lines.length).toBeLessThanOrEqual(2);
        expect(fileContent).toContain('Paris');
    });

    test('identifier filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();

        const identifierField = page.getByRole('textbox', { name: 'Identifier', exact: true });
        await identifierField.fill('foobar');
        await identifierField.press('Enter');
        await page.waitForFunction(
            () => new URL(window.location.href).searchParams.get('identifier') === 'foobar',
        );

        await expect(page.getByText(/Identifier:\s*foobar/)).toBeVisible();

        const filterChip = page.locator('text=/Identifier:\\s*foobar/').locator('..');
        await filterChip.getByRole('button').click();

        await expect(page.getByText(/Identifier:\s*foobar/)).toBeHidden();
        await expect(identifierField).toHaveValue('');

        const urlParams = new URL(page.url()).searchParams;
        expect(urlParams.has('identifier')).toBe(false);
    });

    test('contributor filter can be removed by clicking the X', async ({ page }) => {
        await searchPage.ebolaSudan();

        const contributorField = page.getByRole('textbox', { name: 'Contributor', exact: true });
        await contributorField.fill('Institute');
        await contributorField.press('Enter');
        await page.waitForFunction(
            () => new URL(window.location.href).searchParams.get('contributor') === 'Institute',
        );

        await expect(page.getByText(/Contributor:\s*Institute/)).toBeVisible();

        const filterChip = page.locator('text=/Contributor:\\s*Institute/').locator('..');
        await filterChip.getByRole('button').click();

        await expect(page.getByText(/Contributor:\s*Institute/)).toBeHidden();
        await expect(contributorField).toHaveValue('');

        const urlParams = new URL(page.url()).searchParams;
        expect(urlParams.has('contributor')).toBe(false);
    });
});
