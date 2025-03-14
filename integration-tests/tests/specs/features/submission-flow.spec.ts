import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { join } from 'path';

import { approxMaxAcceptableUrlLength } from "../../../../website/src/routes/routes";
const fs = require('fs');
import { SingleSequenceSubmissionPage } from '../../pages/singlesubmission.page';


test.describe('Submission flow', () => {
    test('submission page shows group creation button when not in a group', async ({
        pageWithACreatedUser,
    }) => {
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

        await page.getByTestId('sequence_file').setInputFiles(sequencesFile);
        await page.getByTestId('metadata_file').setInputFiles(metadataFile);

        await page.getByLabel('I confirm that the data').check();
        await page.getByLabel('I confirm I have not and will').check();

        await page.getByRole('button', { name: 'Submit sequences' }).click();

        await expect(
            page.getByRole('heading', { name: 'Review current submissions' }),
        ).toBeVisible();

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
        const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);

        await submissionPage.navigateToSubmissionPage('Crimean-Congo Hemorrhagic Fever Virus');
        await submissionPage.fillSubmissionForm({
            submissionId: 'XF499',
            collectionCountry: 'Colombia',
            collectionDate: '2021-12-12',
            authorAffiliations: 'Research Lab, University of Example',
        });
        await submissionPage.fillSequenceData({
            L: 'CCACATTGACACAGANAGCTCCAGTAGTGGTTCTCTGTCCTTATTAAACCATGGACTTCTTAAGAAACCTTGACTGGACTCAGGTGATTGCTAGTCAGTATGTGACCAATCCCAGGTTTAATATCTCTGATTACTTCGAGATTGTTCGACAGCCTGGTGACGGGAACTGTTTCTACCACAGTATAGCTGAGTTAACCATGCCCAACAAAACAGATCACTCATACCATAACATCAAACATCTGACTGAGGTGGCAGCACGGAAGTATTATCAGGAGGAGCCGGAGGCTAAGCTCATTGGCCTGAGTCTGGAAGACTATCTTAAGAGGATGCTATCTGACAACGAATGGGGATCGACTCTTGAGGCATCTATGTTGGCTAAGGAAATGGGTATTACTATCATCATTTGGACTGTTGCAGCCAGTGACGAAGTGGAAGCAGGCATAAAGTTTGGTGATGGTGATGTGTTTACAGCCGTGAATCTTCTGCACTCCGGACAGACACACTTTGATGCCCTCAGAATACTGCCNCANTTTGAGGCTGACACAAGAGAGNCCTTNAGTCTGGTAGACAANNTNATAGCTGTGGACCANNTGACCTCNTCTTCAAGTGATGAANTGCAGGACTANGAAGANCTTGCTTTAGCACTTACNAGNGCGGAAGAACCATNTAGACGGTCTAGCNTGGATGAGGTNACCCTNTCTAAGAAACAAGCAGAGNTATTGAGGCAGAAGGCATCTCAGTTGTCNAAACTGGTTAATAAAAGTCAGAACATACCGACTAGAGTTGGCAGGGTTCTGGACTGTATGTTTAACTGCAAACTATGTGTTGAAATATCAGCTGACACTCTAATTCTGCGACCAGAATCTAAAGAAAGAATTGG',
            M: 'GTGGATTGAGCATCTTAATTGCAGCATACTTGTCAACATCATGCATATATCATTGATGTATGCAGTTTTCTGCTTGCAGCTGTGCGGTCTAGGGAAAACTAACGGACTACACAATGGGACTGAACACAATAAGACACACGTTATGACAACGCCTGATGACAGTCAGAGCCCTGAACCGCCAGTGAGCACAGCCCTGCCTGTCACACCGGACCCTTCCACTGTCACACCTACAACACCAGCCAGCGGATTAGAAGGCTCAGGAGAGGTTCACACATCCTCTCCAATCACCACCAAGGGTTTGTCTCTGCCGGGGGCTACATCTGAGCTCCCTGCGACTACTAGCATAGTCACTTCAGGTGCAAGTGATGCCGATTCTAGCACACAGGCAGCCAGAGACACCCCTAAACCATCAGTCCGCACGAGTCTGCCCAACAGCCCTAGCACACCATCCACACCACAAGGCACACACCATCCCGTGAGGAGTCTGCTTTCAGTCACGAGCCCTAAGCCAGAAGAAACACCAACACCGTCAAAATCAAGCAAAGATAGCTCAGCAACCAACAGTCCTCACCCAGCCGCCAGCAGACCAACAACCCCTCCCACAACAGCCCAGAGACCCGCTGAAAACAACAGCCACAACACCACCGAACAGCTTGAGTCCTTAACACAATTAGCAACTTCAGGTTCAATGATCTCTCCAACACAGACAGTCCTCCCAAAGAGTGTTACTTCTATAGCCATTCAAGACATTCATCCCAGCCCAACAAATAGGTCTAAAAGAAACCTTGATATGGAAATAATCT',
            S: 'GTGTTCTCTTGAGTGTTGGCAAAATGGAAAACAAAATCGAGGTGAACAACAAAGATGAGATGAACAAATGGTTTGAGGAGTTCAAGAAAGGAAATGGACTTGTGGACACTTTCACAAACTCNTATTCCTTTTGTGAAAGCGTNCCAAATCTGGACAGNTTTGTNTTCCAGATGGCNAGTGCCACTGATGATGCACAAAANGANTCCATCTACGCATCTGCNCTGGTGGANGCAACCAAATTTTGTGCACCTATATACGAGTGTGCTTGGGCTAGCTCCACTGGCATTGTTAAAAAGGGACTGGAGTGGTTCGAGAAAAATGCAGGAACCATTAAATCCTGGGATGAGAGTTATACTGAGCTTAAAGTTGAAGTTCCCAAAATAGAACAACTCTCCAACTACCAGCAGGCTGCTCTCAAATGGAGAAAAGACATAGGCTTCCGTGTCAATGCAAATACGGCAGCTTTGAGTAACAAAGTCCTAGCAGAGTACAAAGTTCCTGGCGAGATTGTAATGTCTGTCAAAGAGATGTTGTCAGATATGATTAGAAGNAGGAACCTGATTCTCAACAGAGGTGGTGATGAGAACCCACGCGGCCCAGTTAGCCGTGAACATGTGGAGTGGTGC',
        });
        await submissionPage.acceptTerms();
        await submissionPage.submitSequence();

        await expect(
            page.getByRole('heading', { name: 'Review current submissions' }),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Release 1 valid sequence' }).click();
        await page.getByRole('button', { name: 'Release', exact: true }).click();
        await page.getByRole('link', { name: 'Released Sequences' }).click();

        await page.waitForTimeout(35000);
        await page.reload();

        await page.getByRole('cell', { name: 'Colombia' }).click();
        await page.waitForSelector('text="Research Lab, University of Example"');
        await page.waitForSelector('text="NC_005301.3"'); // reference
        await page.waitForSelector('text="NC_005300.2"');
        await page.waitForSelector('text="NC_005302.1"');
    });
});


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