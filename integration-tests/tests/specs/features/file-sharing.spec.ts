import { expect } from '@playwright/test';
import { test } from '../../fixtures/tempdir.fixture';
import { BulkSubmissionPage, SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { checkAllFileContents } from '../../utils/link-helpers';
import { ReviewPage } from '../../pages/review.page';

const ORGANISM_NAME = 'Test organism (with files)';
const RAW_READS = 'raw_reads';
const METADATA_HEADERS = ['submissionId', 'country', 'date'];
const COUNTRY_1 = 'Norway';
const COUNTRY_2 = 'Uganda';
const ID_1 = 'sub1';
const ID_2 = 'sub2';
const FILES_SINGLE = { 'testfile.txt': 'This is a test file.' };
const FILES_DOUBLE = { 'file1.txt': 'Content of file 1.', 'file2.txt': 'Content of file 2.' };

async function submitAndGetReviewPage(
    submissionPage: SingleSequenceSubmissionPage | BulkSubmissionPage,
): Promise<ReviewPage> {
    await submissionPage.acceptTerms();
    const reviewPage = await submissionPage.submitSequence();
    await reviewPage.waitForZeroProcessing();
    return reviewPage;
}

test('submit single seq w/ 2 files thru single seq submission form', async ({
    pageWithGroup,
    page,
    tempDir,
}) => {
    test.setTimeout(180_000);
    const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);

    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.fillSubmissionFormDummyOrganism({
        submissionId: ID_1,
        country: COUNTRY_1,
        date: '2023-10-15',
    });

    await submissionPage.uploadExternalFiles(RAW_READS, FILES_DOUBLE, tempDir);

    const reviewPage = await submitAndGetReviewPage(submissionPage);

    await reviewPage.checkFilesInReviewDialog(FILES_DOUBLE);
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();

    await searchPage.waitForAndOpenModalByRoleAndName('cell', COUNTRY_1);
    await checkAllFileContents(page, FILES_DOUBLE);
});

test('bulk submit 2 seqs with 1 & 2 files respectively', async ({
    pageWithGroup,
    page,
    tempDir,
}) => {
    test.setTimeout(180_000);
    const submissionPage = new BulkSubmissionPage(pageWithGroup);

    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);

    await submissionPage.uploadMetadataFile(METADATA_HEADERS, [
        [ID_1, COUNTRY_1, '2022-12-02'],
        [ID_2, COUNTRY_2, '2022-12-13'],
    ]);

    await page.getByRole('heading', { name: 'Extra files' }).scrollIntoViewIfNeeded();

    await submissionPage.uploadExternalFiles(
        RAW_READS,
        { [ID_1]: FILES_SINGLE, [ID_2]: FILES_DOUBLE },
        tempDir,
    );

    const reviewPage = await submitAndGetReviewPage(submissionPage);

    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();

    await searchPage.waitForAndOpenModalByRoleAndName('cell', COUNTRY_1);
    await checkAllFileContents(page, FILES_SINGLE);

    await searchPage.closeDetailsModal();

    await searchPage.waitForAndOpenModalByRoleAndName('cell', COUNTRY_2);
    await checkAllFileContents(page, FILES_DOUBLE);
});

test('bulk submit 1 seq: discarding and readding a file', async ({
    pageWithGroup,
    page,
    tempDir,
}) => {
    test.setTimeout(180_000);
    const submissionPage = new BulkSubmissionPage(pageWithGroup);

    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);

    await submissionPage.uploadMetadataFile(METADATA_HEADERS, [[ID_1, COUNTRY_1, '2023-01-01']]);

    await page.getByRole('heading', { name: 'Extra files' }).scrollIntoViewIfNeeded();

    await submissionPage.uploadExternalFiles(RAW_READS, { [ID_1]: FILES_SINGLE }, tempDir);

    await page.getByTestId('discard_raw_reads').click();

    await submissionPage.uploadExternalFiles(RAW_READS, { [ID_1]: FILES_DOUBLE }, tempDir);

    const reviewPage = await submitAndGetReviewPage(submissionPage);

    await reviewPage.checkFilesInReviewDialog(FILES_DOUBLE, Object.keys(FILES_SINGLE));

    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();
    await searchPage.waitForSequences('cell', COUNTRY_1);

    await searchPage.waitForAndOpenModalByRoleAndName('cell', COUNTRY_1);
    await checkAllFileContents(page, FILES_DOUBLE);
    await expect(page.getByRole('link', { name: Object.keys(FILES_SINGLE)[0] })).not.toBeVisible();
});
