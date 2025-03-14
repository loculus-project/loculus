import { approxMaxAcceptableUrlLength } from '../../../../website/src/routes/routes';
import { test } from '../../fixtures/sequence.fixture';
import { expect } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';
const fs = require('fs');

test('Download metadata and check number of cols', async ({ pageWithReleasedSequence: page }) => {
    test.setTimeout(120000);
    const searchPage = new SearchPage(page);

    await page.goto('/');
    await page.getByRole('link', { name: 'Crimean-Congo Hemorrhagic Fever Virus' }).click();

    const loculusId = await searchPage.waitForLoculusId();
    expect(loculusId).toBeTruthy();
    console.log(`Found loculus ID: ${loculusId}`);

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
    console.log(`Found ${fields.length} fields in the first line of the TSV`);
});

test('Download metadata with POST and check number of cols', async ({
    pageWithReleasedSequence: page,
}) => {
    test.setTimeout(120000);
    await page.goto('/');
    const searchPage = new SearchPage(page);

    await page.getByRole('link', { name: 'Crimean-Congo Hemorrhagic Fever Virus' }).click();

    const loculusId = await searchPage.waitForLoculusId();
    expect(loculusId).toBeTruthy();
    console.log(`Found loculus ID: ${loculusId}`);

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
    console.log(`Found ${fields.length} fields in the first line of the TSV`);
});
