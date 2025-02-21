import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { join } from 'path';

test.describe('Submission flow', () => {
  test('submission page shows login button when not logged in', async ({ page }) => {
    test.setTimeout(10000);
    await page.getByRole('link', { name: 'Loculus' }).click();
    await page.getByRole('link', { name: 'Submit' }).click();
    await page.getByRole('link', { name: 'Login or register' }).click();
  });

  test('submission page shows group creation button when not in a group', async ({ pageWithACreatedUser }) => {
    test.setTimeout(10000);
    const page = pageWithACreatedUser;
    await page.getByRole('link', { name: 'Loculus' }).click();
    await page.getByRole('link', { name: 'Submit' }).click();
    await page.getByRole('link', { name: 'create a submitting group' }).click();
  });

  test('basic file upload submission flow works', async ({ pageWithGroup }) => {
    test.setTimeout(90000);
    const page = pageWithGroup;
    
    const testFilesDir = join(__dirname, '../../test-data');
    const sequencesFile = join(testFilesDir, 'cchfv_test_sequences.fasta');
    const metadataFile = join(testFilesDir, 'cchfv_test_metadata.tsv');

    await page.getByRole('link', { name: 'Loculus' }).click();
    await page.getByRole('link', { name: 'Submit' }).click();
    await page.getByRole('link', { name: 'Crimean-Congo Hemorrhagic Fever Virus' }).click();
    await page.getByRole('link', { name: 'Submit Upload New Sequences' }).click();
    await page.getByRole('link', { name: 'Use file upload instead' }).click();
    
    await page.getByTestId('sequence_file').setInputFiles(sequencesFile);
    await page.getByTestId('metadata_file').setInputFiles(metadataFile);

    await page.getByLabel('I confirm that the data').check();
    await page.getByLabel('I confirm I have not and will').check();
    
    await page.getByRole('button', { name: 'Submit sequences' }).click();
    await page.getByRole('button', { name: 'Release 1 valid sequence' }).click();
    await page.getByRole('button', { name: 'Release', exact: true }).click();
    await page.getByRole('link', { name: 'Released Sequences' }).click();
    
    await page.waitForTimeout(35000);
    await page.reload();
    
    await page.getByRole('cell', { name: 'Pakistan' }).click();
    await page.waitForSelector('text="test_NIHPAK-19"');
    await page.waitForSelector('text="NC_005302.1"'); // reference
    
  });

  test('basic form submission flow works', async ({ pageWithGroup }) => {
    test.setTimeout(90000);
    const page = pageWithGroup;
    
    await page.getByRole('link', { name: 'Loculus' }).click();
    await page.getByRole('link', { name: 'Submit' }).click();
    await page.getByRole('link', { name: 'Crimean-Congo Hemorrhagic Fever Virus' }).click();
    await page.getByRole('link', { name: 'Submit Upload New Sequences' }).click();

    await page.getByLabel(/Collection country/).fill('Colombia');
    await page.getByLabel(/Collection date/).fill('2012-12-12');
    await page.getByLabel("L:", { exact: true }).fill("CCACATTGACACAGANAGCTCCAGTAGTGGTTCTCTGTCCTTATTAAACCATGGACTTCTTAAGAAACCTTGACTGGACTCAGGTGATTGCTAGTCAGTATGTGACCAATCCCAGGTTTAATATCTCTGATTACTTCGAGATTGTTCGACAGCCTGGTGACGGGAACTGTTTCTACCACAGTATAGCTGAGTTAACCATGCCCAACAAAACAGATCACTCATACCATAACATCAAACATCTGACTGAGGTGGCAGCACGGAAGTATTATCAGGAGGAGCCGGAGGCTAAGCTCATTGGCCTGAGTCTGGAAGACTATCTTAAGAGGATGCTATCTGACAACGAATGGGGATCGACTCTTGAGGCATCTATGTTGGCTAAGGAAATGGGTATTACTATCATCATTTGGACTGTTGCAGCCAGTGACGAAGTGGAAGCAGGCATAAAGTTTGGTGATGGTGATGTGTTTACAGCCGTGAATCTTCTGCACTCCGGACAGACACACTTTGATGCCCTCAGAATACTGCCNCANTTTGAGGCTGACACAAGAGAGNCCTTNAGTCTGGTAGACAANNTNATAGCTGTGGACCANNTGACCTCNTCTTCAAGTGATGAANTGCAGGACTANGAAGANCTTGCTTTAGCACTTACNAGNGCGGAAGAACCATNTAGACGGTCTAGCNTGGATGAGGTNACCCTNTCTAAGAAACAAGCAGAGNTATTGAGGCAGAAGGCATCTCAGTTGTCNAAACTGGTTAATAAAAGTCAGAACATACCGACTAGAGTTGGCAGGGTTCTGGACTGTATGTTTAACTGCAAACTATGTGTTGAAATATCAGCTGACACTCTAATTCTGCGACCAGAATCTAAAGAAAGAATTGG");
    await page.getByLabel("M:", { exact: true }).fill("GTGGATTGAGCATCTTAATTGCAGCATACTTGTCAACATCATGCATATATCATTGATGTATGCAGTTTTCTGCTTGCAGCTGTGCGGTCTAGGGAAAACTAACGGACTACACAATGGGACTGAACACAATAAGACACACGTTATGACAACGCCTGATGACAGTCAGAGCCCTGAACCGCCAGTGAGCACAGCCCTGCCTGTCACACCGGACCCTTCCACTGTCACACCTACAACACCAGCCAGCGGATTAGAAGGCTCAGGAGAGGTTCACACATCCTCTCCAATCACCACCAAGGGTTTGTCTCTGCCGGGGGCTACATCTGAGCTCCCTGCGACTACTAGCATAGTCACTTCAGGTGCAAGTGATGCCGATTCTAGCACACAGGCAGCCAGAGACACCCCTAAACCATCAGTCCGCACGAGTCTGCCCAACAGCCCTAGCACACCATCCACACCACAAGGCACACACCATCCCGTGAGGAGTCTGCTTTCAGTCACGAGCCCTAAGCCAGAAGAAACACCAACACCGTCAAAATCAAGCAAAGATAGCTCAGCAACCAACAGTCCTCACCCAGCCGCCAGCAGACCAACAACCCCTCCCACAACAGCCCAGAGACCCGCTGAAAACAACAGCCACAACACCACCGAACAGCTTGAGTCCTTAACACAATTAGCAACTTCAGGTTCAATGATCTCTCCAACACAGACAGTCCTCCCAAAGAGTGTTACTTCTATAGCCATTCAAGACATTCATCCCAGCCCAACAAATAGGTCTAAAAGAAACCTTGATATGGAAATAATCT");
    await page.getByLabel("S:", { exact: true }).fill("GTGTTCTCTTGAGTGTTGGCAAAATGGAAAACAAAATCGAGGTGAACAACAAAGATGAGATGAACAAATGGTTTGAGGAGTTCAAGAAAGGAAATGGACTTGTGGACACTTTCACAAACTCNTATTCCTTTTGTGAAAGCGTNCCAAATCTGGACAGNTTTGTNTTCCAGATGGCNAGTGCCACTGATGATGCACAAAANGANTCCATCTACGCATCTGCNCTGGTGGANGCAACCAAATTTTGTGCACCTATATACGAGTGTGCTTGGGCTAGCTCCACTGGCATTGTTAAAAAGGGACTGGAGTGGTTCGAGAAAAATGCAGGAACCATTAAATCCTGGGATGAGAGTTATACTGAGCTTAAAGTTGAAGTTCCCAAAATAGAACAACTCTCCAACTACCAGCAGGCTGCTCTCAAATGGAGAAAAGACATAGGCTTCCGTGTCAATGCAAATACGGCAGCTTTGAGTAACAAAGTCCTAGCAGAGTACAAAGTTCCTGGCGAGATTGTAATGTCTGTCAAAGAGATGTTGTCAGATATGATTAGAAGNAGGAACCTGATTCTCAACAGAGGTGGTGATGAGAACCCACGCGGCCCAGTTAGCCGTGAACATGTGGAGTGGTGC");
    
    await page.getByLabel('I confirm that the data').check();
    await page.getByLabel('I confirm I have not and will').check();
    
    await page.getByRole('button', { name: 'Submit sequences' }).click();
    await page.getByRole('button', { name: 'Release 1 valid sequence' }).click();
    await page.getByRole('button', { name: 'Release', exact: true }).click();
    await page.getByRole('link', { name: 'Released Sequences' }).click();
    
    await page.waitForTimeout(35000);
    await page.reload();
    
    await page.getByRole('cell', { name: 'Colombia' }).click();
    await page.waitForSelector('text="2012-12-12"');
    await page.waitForSelector('text="NC_005301.3"'); // reference
    await page.waitForSelector('text="NC_005300.2"'); // reference
    await page.waitForSelector('text="NC_005302.1"'); // reference
  });
});
