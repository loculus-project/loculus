import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { join } from 'path';
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

        while (!(await page.getByRole('cell', { name: 'Pakistan' }).isVisible())) {
            await page.reload();
            await page.waitForTimeout(2000);
        }

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

        while (!(await page.getByRole('cell', { name: 'Colombia' }).isVisible())) {
            await page.reload();
            await page.waitForTimeout(2000);
        }

        await page.getByRole('cell', { name: 'Colombia' }).click();
        await page.waitForSelector('text="Research Lab, University of Example"');
        await page.waitForSelector('text="NC_005301.3"'); // reference
        await page.waitForSelector('text="NC_005300.2"');
        await page.waitForSelector('text="NC_005302.1"');
    });
});
