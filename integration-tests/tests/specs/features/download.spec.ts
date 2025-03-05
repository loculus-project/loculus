import { approxMaxAcceptableUrlLength } from "../../../../website/src/routes/routes";
const { test, expect } = require('@playwright/test');
const fs = require('fs');

test('Download metadata and check number of cols', async ({ page }) => {
  console.log('Waiting for 30 seconds before starting the test...');
  test.setTimeout(90000);
  await page.waitForTimeout(30000);
  console.log('Continuing with test after delay');

  await page.waitForFunction(() => {
    const content = document.body.innerText;
    return /LOC_[A-Z0-9]+\.[0-9]+/.test(content);
  });

  const content = await page.content();
  const loculusIdMatch = content.match(/LOC_[A-Z0-9]+\.[0-9]+/);
  const loculusId = loculusIdMatch ? loculusIdMatch[0] : null;
  expect(loculusId).toBeTruthy();
  console.log(`Found loculus ID: ${loculusId}`);

  await page.goto('/');
  await page.getByRole('link', { name: 'Crimean-Congo Hemorrhagic Fever Virus' }).click();
  
  await page.getByRole('button', { name: 'Download all entries' }).click();
  await page.getByLabel('I agree to the data use terms.').check();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('start-download').click();
  const download = await downloadPromise;

  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  const fileContent = fs.readFileSync(downloadPath, 'utf8');
  const lines = fileContent.split('\n');
  const firstLine = lines[0];
  const fields = firstLine.split('\t');

  expect(fields).toHaveLength(8);
  console.log(`Found ${fields.length} fields in the first line of the TSV`);
});


test('Download metadata with POST and check number of cols', async ({ page }) => {
  console.log('Waiting for 30 seconds before starting the test...');
  test.setTimeout(90000);
  await page.waitForTimeout(30000);
  console.log('Continuing with test after delay');

  await page.goto('/');
  await page.getByRole('link', { name: 'Crimean-Congo Hemorrhagic Fever Virus' }).click();

  await page.waitForFunction(() => {
    const content = document.body.innerText;
    return /LOC_[A-Z0-9]+\.[0-9]+/.test(content);
  });

  const content = await page.content();
  const loculusIdMatch = content.match(/LOC_[A-Z0-9]+\.[0-9]+/);
  const loculusId = loculusIdMatch ? loculusIdMatch[0] : null;
  expect(loculusId).toBeTruthy();
  console.log(`Found loculus ID: ${loculusId}`);

  const query = `${loculusId}\n${'A'.repeat(2000)}`;
  await page.getByLabel('Accession').type(query);
  
  await page.getByRole('button', { name: 'Download all entries' }).click();
  await page.getByLabel('I agree to the data use terms.').check();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('start-download').click();
  const download = await downloadPromise;

  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  const fileContent = fs.readFileSync(downloadPath, 'utf8');
  const lines = fileContent.split('\n');
  const firstLine = lines[0];
  const fields = firstLine.split('\t');

  expect(fields).toHaveLength(8);
  console.log(`Found ${fields.length} fields in the first line of the TSV`);
});