import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('test', async ({ page }) => {
  await page.getByRole('link', { name: 'Ebola Sudan Ebola Sudan }).click();
  await page.getByRole('button', { name: 'Download all entries' }).click();
  await page.getByLabel('I agree to the data use terms.').check();
  
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('start-download').click();
  const download = await downloadPromise;
  
  // Wait for the download to complete
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  
  // Read the first line of the TSV file
  const fileContent = fs.readFileSync(downloadPath, 'utf8');
  const lines = fileContent.split('\n');
  const firstLine = lines[0];
  const fields = firstLine.split('\t');
  
  // Assert that the first line has between 3 and 8 fields
  expect(fields.length).toBeGreaterThanOrEqual(3);
  expect(fields.length).toBeLessThanOrEqual(8);
  
  // Optional: Log the actual number of fields found
  console.log(`Found ${fields.length} fields in the first line of the TSV`);
});