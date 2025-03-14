import { approxMaxAcceptableUrlLength } from "../../../../website/src/routes/routes";
import { test, expect } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';
const fs = require('fs');

test('Download metadata and check number of cols', async ({ page }) => {
  const searchPage = new SearchPage(page);

  await page.goto('/');
  await page.getByRole('link', { name: 'Crimean-Congo Hemorrhagic Fever Virus' }).click();

  const loculusId = await searchPage.waitForLoculusId();
  expect(loculusId).toBeTruthy();
  console.log(`Found loculus ID: ${loculusId}`);
  
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
  const searchPage = new SearchPage(page);

  await page.goto('/');
  await page.getByRole('link', { name: 'Crimean-Congo Hemorrhagic Fever Virus' }).click();

  const loculusId = await searchPage.waitForLoculusId();
  expect(loculusId).toBeTruthy();
  console.log(`Found loculus ID: ${loculusId}`);

  const query = `${loculusId}\n${'A'.repeat(2000)}`;
  await searchPage.enterAccessions(query);
  
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