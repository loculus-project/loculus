import { expect, test } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';
const fs = require('fs');

test('Download metadata and check number of cols', async ({ page }) => {
    test.setTimeout(30000);
    const searchPage = new SearchPage(page);
    await searchPage.ebolaSudan();

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
    await page.getByRole('button', { name: 'Done' }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('start-download').click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const fileContent = fs.readFileSync(downloadPath, 'utf8');
    const lines = fileContent.split('\n');
    const firstLine = lines[0];
    const fields = firstLine.split('\t');

    expect(fields).toHaveLength(9);
});

test('Download metadata with POST and check number of cols', async ({
    page,
}) => {
    test.setTimeout(30000);
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
    await page.getByRole('button', { name: 'Done' }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('start-download').click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const fileContent = fs.readFileSync(downloadPath, 'utf8');
    const lines = fileContent.split('\n');
    const firstLine = lines[0];
    const fields = firstLine.split('\t');

    expect(fields).toHaveLength(9);
});
