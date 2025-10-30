import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../pages/search.page';

test.describe('Sequence details page', () => {
    test('should navigate to sequence details page and display accession heading', async ({
        page,
    }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const accessionVersion = await searchPage.waitForLoculusId();
        expect(accessionVersion).toBeTruthy();

        await page.goto(`/seq/${accessionVersion}`);

        await expect(page.getByRole('heading', { name: accessionVersion })).toBeVisible();
    });

    test('should display metadata fields on sequence details page', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const accessionVersion = await searchPage.waitForLoculusId();
        await page.goto(`/seq/${accessionVersion}`);

        await expect(page.getByRole('heading', { name: accessionVersion })).toBeVisible();
        await expect(page.getByText('Collection country')).toBeVisible();
        await expect(page.getByText('Collection date', { exact: true }).first()).toBeVisible();
    });

    test('should display files section on sequence details page', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const accessionVersion = await searchPage.waitForLoculusId();
        await page.goto(`/seq/${accessionVersion}`);

        await expect(page.getByRole('heading', { name: /Files/i })).toBeVisible();
    });

    test('should navigate directly to sequence details from URL', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const accessionVersion = await searchPage.waitForLoculusId();

        await page.goto(`/seq/${accessionVersion}`);
        await expect(page.getByRole('heading', { name: accessionVersion })).toBeVisible();

        await expect(page.getByText('Collection country')).toBeVisible();
        await expect(page.getByRole('heading', { name: /Files/i })).toBeVisible();
    });
});
