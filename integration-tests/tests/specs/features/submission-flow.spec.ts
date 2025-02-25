import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { join } from 'path';
import fs from 'fs';

test.describe('Virus Sequence Flows', () => {
  // Define test titles as constants for dependency references
  const SUBMISSION_TEST = 'basic submission flow works';
  const DOWNLOAD_TEST = 'can download Ebola Sudan entries';

  test.describe('Submission flow', () => {
    test(SUBMISSION_TEST, async ({ pageWithGroup }) => {
      test.setTimeout(90000);
      const page = pageWithGroup;
      
      const testFilesDir = join(__dirname, '../../test-data');
      const sequencesFile = join(testFilesDir, 'cchfv_test_sequences.fasta');
      const metadataFile = join(testFilesDir, 'cchfv_test_metadata.tsv');

      // Navigate to submission page
      await page.getByRole('link', { name: 'Loculus' }).click();
      await page.getByRole('link', { name: 'Submit' }).click();
      await page.getByRole('link', { name: 'Crimean-Congo Hemorrhagic Fever Virus' }).click();
      await page.getByRole('link', { name: 'Submit Upload New Sequences' }).click();
      
      // Upload files
      await page.getByTestId('sequence_file').setInputFiles(sequencesFile);
      await page.getByTestId('metadata_file').setInputFiles(metadataFile);

      // Accept terms
      await page.getByLabel('I confirm that the data').check();
      await page.getByLabel('I confirm I have not and will').check();
      
      // Submit and release sequence
      await page.getByRole('button', { name: 'Submit sequences' }).click();
      await page.getByRole('button', { name: 'Release 1 valid sequence' }).click();
      await page.getByRole('button', { name: 'Release', exact: true }).click();
      await page.getByRole('link', { name: 'Released Sequences' }).click();
      
      // Wait for processing and verify results
      await page.waitForTimeout(35000);
      await page.reload();
      
      await page.getByRole('cell', { name: 'Pakistan' }).click();
      await page.waitForSelector('text="test_NIHPAK-19"');
      await page.waitForSelector('text="NC_005302.1"'); // reference
    });
  });

  test.describe('Download flow', () => {
    test.use({ dependsOn: [SUBMISSION_TEST] });
    
    test(DOWNLOAD_TEST, async ({ page }) => {

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
  });
});