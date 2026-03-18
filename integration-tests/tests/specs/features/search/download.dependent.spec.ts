import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';
import fs from 'fs';

const NULL_QUERY_VALUE = '_null_';

test('Download metadata and check number of cols', async ({ page }) => {
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

test('Download with null filter sends isNull param to LAPIS', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Download tests are skipped on WebKit');

    const searchPage = new SearchPage(page);
    await searchPage.ebolaSudan();

    // Navigate with a null filter applied via URL to avoid needing the option in autocomplete
    await page.goto(`${page.url()}?geoLocCountry=${NULL_QUERY_VALUE}`);

    await page.getByRole('button', { name: 'Download all entries' }).click();
    await page.getByLabel('I agree to the data use terms.').check();

    const requestPromise = page.waitForRequest((req) => req.url().includes('/sample/details'));
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('start-download').click();

    const request = await requestPromise;
    await downloadPromise;

    const url = new URL(request.url());
    expect(url.searchParams.get('geoLocCountry.isNull')).toBe('true');
    expect(url.searchParams.has('geoLocCountry')).toBe(false);
});

test('Download metadata with POST and check number of cols', async ({ page, browserName }) => {
    test.skip(
        browserName === 'firefox',
        'Firefox raises a native warning that blocks the download',
    );
    await page.goto('/');
    const searchPage = new SearchPage(page);
    await searchPage.ebolaSudan();

    const accessionVersions = await searchPage.waitForSequencesInSearch(1);
    const { accession } = accessionVersions[0];

    const query = `${accession}\n${'A'.repeat(2000)}`;
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
