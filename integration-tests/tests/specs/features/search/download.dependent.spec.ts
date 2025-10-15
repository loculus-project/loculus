import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';
import fs from 'fs';
import { testScreenshot } from '../../../utils/screenshot';

test('Download metadata and check number of cols', async ({ page }) => {
    const searchPage = new SearchPage(page);
    await searchPage.ebolaSudan();

    await page.getByRole('button', { name: 'Download all entries' }).click();
    await page.getByLabel('I agree to the data use terms.').check();
    await testScreenshot(page, 'download-dialog.png');

    await page.getByRole('button', { name: /Choose fields/ }).click();
    const fieldCheckboxes = await page.getByRole('checkbox').all();
    for (const checkbox of fieldCheckboxes) {
        const isChecked = await checkbox.isChecked();
        if (!isChecked) {
            await checkbox.check();
            break;
        }
    }
    await page.getByTestId('field-selector-close-button').click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('start-download').click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const fileContent = fs.readFileSync(downloadPath, 'utf8');
    const lines = fileContent.split('\n');
    const firstLine = lines[0];
    const fields = firstLine.split('\t');

    expect(fields).toHaveLength(11);
});

test('Download metadata with POST and check number of cols', async ({ page, browserName }) => {
    test.skip(
        browserName === 'firefox',
        'Firefox raises a native warning that blocks the download',
    );
    await page.goto('/');
    const searchPage = new SearchPage(page);
    await searchPage.ebolaSudan();

    const loculusId = await searchPage.waitForLoculusId();
    expect(loculusId).toBeTruthy();

    const query = `${loculusId}\n${'A'.repeat(2000)}`;
    await searchPage.enterAccessions(query);

    await page.getByRole('button', { name: 'Download all entries' }).click();
    await page.getByLabel('I agree to the data use terms.').check();

    await page.getByRole('button', { name: /Choose fields/ }).click();
    const fieldCheckboxes = await page.getByRole('checkbox').all();
    for (const checkbox of fieldCheckboxes) {
        const isChecked = await checkbox.isChecked();
        if (!isChecked) {
            await checkbox.check();
            break;
        }
    }
    await page.getByTestId('field-selector-close-button').click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('start-download').click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const fileContent = fs.readFileSync(downloadPath, 'utf8');
    const lines = fileContent.split('\n');
    const firstLine = lines[0];
    const fields = firstLine.split('\t');

    expect(fields).toHaveLength(11);
});
