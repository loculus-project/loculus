import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { join } from 'path';
import { BulkSubmissionPage, SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { NavigationPage } from '../../pages/navigation.page';
import { ReviewPage } from '../../pages/review.page';

test.describe('Submission flow', () => {
    test('submission page shows group creation button when not in a group', async ({
        page,
        authenticatedUser,
    }) => {
        void authenticatedUser;
        const submissionPage = new SingleSequenceSubmissionPage(page);
        await submissionPage.navigateToOrganism('Ebola Sudan');
        const navigation = new NavigationPage(page);
        await navigation.clickSubmitSequences();
        await page.getByRole('link', { name: 'create a submitting group' }).click();
    });

    test('basic file upload submission flow works', async ({ page, groupId }) => {
        test.setTimeout(120_000);
        void groupId;

        const testFilesDir = join(__dirname, '../../test-data');
        const sequencesFile = join(testFilesDir, 'cchfv_test_sequences.fasta');
        const metadataFile = join(testFilesDir, 'cchfv_test_metadata.tsv');

        const submissionPage = new BulkSubmissionPage(page);
        await submissionPage.navigateToSubmissionPage('Crimean-Congo Hemorrhagic Fever Virus');

        await page.getByTestId('sequence_file').setInputFiles(sequencesFile);
        await page.getByTestId('metadata_file').setInputFiles(metadataFile);

        await page.getByLabel('I confirm that I have the legal right').check();
        await page.getByLabel('I confirm I have not and will').check();

        await page.getByRole('button', { name: 'Upload and proceed to Approval' }).click();
        await page.getByRole('button', { name: 'Continue under Open terms' }).click();

        await expect(
            page.getByRole('heading', { name: 'Review pending submissions' }),
        ).toBeVisible();

        const reviewPage = new ReviewPage(page);
        await reviewPage.releaseAndGoToReleasedSequences();

        await expect
            .poll(
                async () => {
                    await page.reload();
                    return page.getByRole('cell', { name: 'Pakistan' }).isVisible();
                },
                {
                    message: 'Cell with name Pakistan never became visible.',
                    timeout: 90000,
                },
            )
            .toBe(true);

        await page.getByRole('cell', { name: 'Pakistan' }).click();
        await page.waitForSelector('text="test_NIHPAK-19"');
        await page.waitForSelector('text="NC_005302.1"'); // reference
    });

    test('basic form submission flow works', async ({ page, groupId }) => {
        test.setTimeout(120_000);
        void groupId;
        const submissionPage = new SingleSequenceSubmissionPage(page);

        await submissionPage.navigateToSubmissionPage('Crimean-Congo Hemorrhagic Fever Virus');
        await submissionPage.fillSubmissionForm({
            submissionId: 'XF499',
            collectionCountry: 'Colombia',
            collectionDate: '2021-12-12',
            authorAffiliations: 'Research Lab, University of Example',
        });
        await submissionPage.fillSequenceData({
            fastaHeaderL:
                'CCACATTGACACAGANAGCTCCAGTAGTGGTTCTCTGTCCTTATTAAACCATGGACTTCTTAAGAAACCTTGACTGGACTCAGGTGATTGCTAGTCAGTATGTGACCAATCCCAGGTTTAATATCTCTGATTACTTCGAGATTGTTCGACAGCCTGGTGACGGGAACTGTTTCTACCACAGTATAGCTGAGTTAACCATGCCCAACAAAACAGATCACTCATACCATAACATCAAACATCTGACTGAGGTGGCAGCACGGAAGTATTATCAGGAGGAGCCGGAGGCTAAGCTCATTGGCCTGAGTCTGGAAGACTATCTTAAGAGGATGCTATCTGACAACGAATGGGGATCGACTCTTGAGGCATCTATGTTGGCTAAGGAAATGGGTATTACTATCATCATTTGGACTGTTGCAGCCAGTGACGAAGTGGAAGCAGGCATAAAGTTTGGTGATGGTGATGTGTTTACAGCCGTGAATCTTCTGCACTCCGGACAGACACACTTTGATGCCCTCAGAATACTGCCNCANTTTGAGGCTGACACAAGAGAGNCCTTNAGTCTGGTAGACAANNTNATAGCTGTGGACCANNTGACCTCNTCTTCAAGTGATGAANTGCAGGACTANGAAGANCTTGCTTTAGCACTTACNAGNGCGGAAGAACCATNTAGACGGTCTAGCNTGGATGAGGTNACCCTNTCTAAGAAACAAGCAGAGNTATTGAGGCAGAAGGCATCTCAGTTGTCNAAACTGGTTAATAAAAGTCAGAACATACCGACTAGAGTTGGCAGGGTTCTGGACTGTATGTTTAACTGCAAACTATGTGTTGAAATATCAGCTGACACTCTAATTCTGCGACCAGAATCTAAAGAAAGAATTGG',
            fastaHeaderM:
                'GTGGATTGAGCATCTTAATTGCAGCATACTTGTCAACATCATGCATATATCATTGATGTATGCAGTTTTCTGCTTGCAGCTGTGCGGTCTAGGGAAAACTAACGGACTACACAATGGGACTGAACACAATAAGACACACGTTATGACAACGCCTGATGACAGTCAGAGCCCTGAACCGCCAGTGAGCACAGCCCTGCCTGTCACACCGGACCCTTCCACTGTCACACCTACAACACCAGCCAGCGGATTAGAAGGCTCAGGAGAGGTTCACACATCCTCTCCAATCACCACCAAGGGTTTGTCTCTGCCGGGGGCTACATCTGAGCTCCCTGCGACTACTAGCATAGTCACTTCAGGTGCAAGTGATGCCGATTCTAGCACACAGGCAGCCAGAGACACCCCTAAACCATCAGTCCGCACGAGTCTGCCCAACAGCCCTAGCACACCATCCACACCACAAGGCACACACCATCCCGTGAGGAGTCTGCTTTCAGTCACGAGCCCTAAGCCAGAAGAAACACCAACACCGTCAAAATCAAGCAAAGATAGCTCAGCAACCAACAGTCCTCACCCAGCCGCCAGCAGACCAACAACCCCTCCCACAACAGCCCAGAGACCCGCTGAAAACAACAGCCACAACACCACCGAACAGCTTGAGTCCTTAACACAATTAGCAACTTCAGGTTCAATGATCTCTCCAACACAGACAGTCCTCCCAAAGAGTGTTACTTCTATAGCCATTCAAGACATTCATCCCAGCCCAACAAATAGGTCTAAAAGAAACCTTGATATGGAAATAATCT',
            fastaHeaderS:
                'GTGTTCTCTTGAGTGTTGGCAAAATGGAAAACAAAATCGAGGTGAACAACAAAGATGAGATGAACAAATGGTTTGAGGAGTTCAAGAAAGGAAATGGACTTGTGGACACTTTCACAAACTCNTATTCCTTTTGTGAAAGCGTNCCAAATCTGGACAGNTTTGTNTTCCAGATGGCNAGTGCCACTGATGATGCACAAAANGANTCCATCTACGCATCTGCNCTGGTGGANGCAACCAAATTTTGTGCACCTATATACGAGTGTGCTTGGGCTAGCTCCACTGGCATTGTTAAAAAGGGACTGGAGTGGTTCGAGAAAAATGCAGGAACCATTAAATCCTGGGATGAGAGTTATACTGAGCTTAAAGTTGAAGTTCCCAAAATAGAACAACTCTCCAACTACCAGCAGGCTGCTCTCAAATGGAGAAAAGACATAGGCTTCCGTGTCAATGCAAATACGGCAGCTTTGAGTAACAAAGTCCTAGCAGAGTACAAAGTTCCTGGCGAGATTGTAATGTCTGTCAAAGAGATGTTGTCAGATATGATTAGAAGNAGGAACCTGATTCTCAACAGAGGTGGTGATGAGAACCCACGCGGCCCAGTTAGCCGTGAACATGTGGAGTGGTGC',
        });
        await submissionPage.acceptTerms();
        const reviewPage = await submissionPage.submitSequence();

        await expect(
            page.getByRole('heading', { name: 'Review pending submissions' }),
        ).toBeVisible();

        await reviewPage.releaseAndGoToReleasedSequences();

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
