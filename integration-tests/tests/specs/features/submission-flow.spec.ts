import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { join } from 'path';
import { BulkSubmissionPage, SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { NavigationPage } from '../../pages/navigation.page';
import { reloadUntilVisible } from '../../utils/reload-helpers';
import { allowConsoleError } from '../../fixtures/console-warnings.fixture';

const TEST_FILES_DIR = join(__dirname, '../../test-data');

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

    test('file upload submission flow works with the downloaded TSV and XLSX templates', async ({
        page,
        groupId,
    }) => {
        test.setTimeout(120_000);
        void groupId;

        const submissionPage = new BulkSubmissionPage(page);
        await submissionPage.navigateToSubmissionPage('Crimean-Congo Hemorrhagic Fever Virus');

        const template = await submissionPage.downloadXlsxTemplate();
        const countries = template.dropdownOptions('geoLocCountry');
        expect(countries).toContain('Pakistan');
        expect(countries).not.toContain('Atlantis');

        const rows = [
            {
                id: 'test_NIHPAK-19',
                fastaIds: 'test_NIHPAK-19_L test_NIHPAK-19_M test_NIHPAK-19_S',
                geoLocCountry: 'Pakistan',
                sampleCollectionDate: new Date(2023, 7, 26),
                authorAffiliations: 'National Institute of Health, Department of Virology',
            },
        ];
        await page
            .getByTestId('sequence_file')
            .setInputFiles(join(TEST_FILES_DIR, 'cchfv_test_sequences.fasta'));
        await submissionPage.acceptTerms();

        // Broken templates are rejected before any processing: at submit, or already on file selection.
        allowConsoleError(test, 'responded with a status of 422');
        const tsvTemplate = await submissionPage.downloadTsvTemplate();
        await submissionPage.uploadFilledTemplate(tsvTemplate, rows, {
            renameHeaders: { id: 'ID' },
        });
        await submissionPage.submitExpectingRejection(
            /Missing id column|does not contain either header 'id' or 'submissionId'/,
        );
        await submissionPage.discardMetadataFile();

        await submissionPage.uploadFilledTemplate(template, rows, { deleteHeaderRow: true });
        await expect(page.getByText('Sheet Data is empty.')).toBeVisible();
        await expect(page.getByTestId('discard_metadata_file')).toHaveCount(0);
        await submissionPage.uploadFilledTemplate(template, rows);
        const reviewPage = await submissionPage.submitSequence();
        await reviewPage.waitForAllProcessed();
        await reviewPage.expectProcessedWithoutErrors('test_NIHPAK-19', ['Pakistan', '2023-08-26']);
        await reviewPage.releaseAndGoToReleasedSequences();
        await reloadUntilVisible(page, page.getByRole('cell', { name: 'Pakistan' }));

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

        await reloadUntilVisible(page, page.getByRole('cell', { name: 'Colombia' }));

        await page.getByRole('cell', { name: 'Colombia' }).click();
        await page.waitForSelector('text="Research Lab, University of Example"');
        await page.waitForSelector('text="NC_005301.3"'); // reference
        await page.waitForSelector('text="NC_005300.2"');
        await page.waitForSelector('text="NC_005302.1"');
    });
});
