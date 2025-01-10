import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { join } from 'path';

test.describe('Submission flow', () => {
  test('basic submission flow works', async ({ pageWithGroup }) => {
    test.setTimeout(90000);
    const page = pageWithGroup;
    
    const testFilesDir = join(__dirname, '../../test-data');
    const sequencesFile = join(testFilesDir, 'cchfv_test_sequences.fasta');
    const metadataFile = join(testFilesDir, 'cchfv_test_metadata.tsv');

    await page.getByRole('link', { name: 'Loculus' }).click();
    await page.getByRole('link', { name: 'Submit' }).click();
    await page.getByRole('link', { name: 'Crimean-Congo Hemorrhagic Fever Virus' }).click();
    await page.getByRole('link', { name: 'Submit Upload New Sequences' }).click();
    
    await page.getByTestId('sequence_file').setInputFiles(sequencesFile);
    await page.getByTestId('metadata_file').setInputFiles(metadataFile);

    await page.getByLabel('I confirm that the data').check();
    await page.locator('.mt-2 > div').first().click({
      button: 'right'
    });
    await page.getByLabel('I confirm I have not and will').check();
    
    await page.getByRole('button', { name: 'Submit sequences' }).click();
    await page.getByRole('button', { name: 'Release 1 valid sequence' }).click();
    await page.getByRole('button', { name: 'Release', exact: true }).click();
    await page.getByRole('link', { name: 'Released Sequences' }).click();
    
    await page.waitForTimeout(35000);
    await page.reload();
    
    await page.getByRole('cell', { name: 'Pakistan' }).click();
    await page.waitForSelector('text="test_NIHPAK-19"');
  });
});