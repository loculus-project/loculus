import { expect } from '@playwright/test';
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

        await page.getByLabel('I confirm that the data').check();
        await page.getByLabel('I confirm I have not and will').check();

        await page.getByRole('button', { name: 'Submit sequences' }).click();
        await page.getByRole('button', { name: 'Continue under Open terms' }).click();

        await expect(
            page.getByRole('heading', { name: 'Review current submissions' }),
        ).toBeVisible();

        // Verify processing completes
        await expect
            .poll(
                async () => {
                    const processingText = await page
                        .locator('text=/\\d+ of \\d+ sequences processed/')
                        .textContent();
                    if (!processingText) return false;
                    const match = processingText.match(/(\d+) of (\d+)/);
                    return match && match[1] === match[2];
                },
                {
                    message: 'Processing did not complete',
                    timeout: 60000,
                },
            )
            .toBe(true);
    });
});
