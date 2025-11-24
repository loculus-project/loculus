import { test } from '../../fixtures/group.fixture';
import { join } from 'path';
import { BulkSubmissionPage } from '../../pages/submission.page';

test.describe('Compressed file upload', () => {
    test('should upload compressed files (.zst) and submit successfully', async ({
        page,
        groupId,
    }) => {
        test.setTimeout(120_000);
        void groupId;

        const testFilesDir = join(__dirname, '../../test-data');
        const compressedSequencesFile = join(testFilesDir, 'cchfv_test_sequences.fasta.zst');
        const compressedMetadataFile = join(testFilesDir, 'cchfv_test_metadata.tsv.zst');

        const submissionPage = new BulkSubmissionPage(page);
        await submissionPage.navigateToSubmissionPage('Crimean-Congo Hemorrhagic Fever Virus');

        await page.getByTestId('sequence_file').setInputFiles(compressedSequencesFile);
        await page.getByTestId('metadata_file').setInputFiles(compressedMetadataFile);

        await submissionPage.acceptTerms();
        const reviewPage = await submissionPage.submitSequence();

        await reviewPage.waitForAllProcessed();
    });
});
