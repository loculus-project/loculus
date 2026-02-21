import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../pages/search.page';
import fs from 'fs';

test('Download metadata TSV for a single sequence', async ({ page }) => {
    const searchPage = new SearchPage(page);
    await searchPage.ebolaSudan();

    const accessionVersions = await searchPage.waitForSequencesInSearch(1);
    const { accessionVersion } = accessionVersions[0];

    await page.goto(`/seq/${accessionVersion}`);
    await expect(page.getByRole('heading', { name: accessionVersion })).toBeVisible();

    await page.getByTestId('metadata-download-dropdown').click();
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
