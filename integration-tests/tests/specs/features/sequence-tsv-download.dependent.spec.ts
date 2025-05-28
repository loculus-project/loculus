import { expect, test } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';
const fs = require('fs');

test('Download metadata TSV for a single sequence', async ({ page }) => {
    const searchPage = new SearchPage(page);
    await searchPage.ebolaSudan();

    const loculusId = await searchPage.waitForLoculusId();
    expect(loculusId).toBeTruthy();

    await page.goto(`/seq/${loculusId}`);
    await expect(page.getByRole('heading', { name: loculusId })).toBeVisible();

    await page.getByText('Download', { exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download metadata TSV' }).click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const fileContent = fs.readFileSync(downloadPath, 'utf8');
    const lines = fileContent.split('\n');
    const fields = lines[0].split('\t');
    expect(fields.length).toBeGreaterThan(5);
    const values = lines[1].split('\t');
    expect(values.length).toBeGreaterThan(5);
});
