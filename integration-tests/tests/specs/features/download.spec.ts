const { test, expect } = require('@playwright/test');
const fs = require('fs');

test('Download flow', async ({ page }) => {
  console.log('Waiting for 20 seconds before starting the test...');
  await page.waitForTimeout(20000);
  console.log('Continuing with test after delay');

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