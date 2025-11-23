import { test } from '../../fixtures/tmpdir.fixture';
import { BulkSubmissionPage, SingleSequenceSubmissionPage } from '../../pages/submission.page';

const ORGANISM_NAME = 'Test organism (with files)';
const RAW_READS = 'raw_reads';
const METADATA_HEADERS = ['submissionId', 'country', 'date'];
const COUNTRY_1 = 'Norway';
const COUNTRY_2 = 'Uganda';
const ID_1 = 'sub1';
const ID_2 = 'sub2';
const FILES_SINGLE = { 'testfile.txt': 'This is a test file.' };
const FILES_DOUBLE = { 'file1.txt': 'Content of file 1.', 'file2.txt': 'Content of file 2.' };

test('submit single seq w/ 2 files thru single seq submission form', async ({
    page,
    groupId,
    tmpDir,
}) => {
    test.setTimeout(180_000);
    void groupId;
    const submissionPage = new SingleSequenceSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.fillSubmissionFormDummyOrganism({
        submissionId: ID_1,
        country: COUNTRY_1,
        date: '2023-10-15',
    });
    await submissionPage.uploadExternalFiles(RAW_READS, FILES_DOUBLE, tmpDir);
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone();
    await reviewPage.checkFilesInReviewDialog(FILES_DOUBLE);
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();
    await searchPage.waitForAndOpenModalByRoleAndName('cell', COUNTRY_1);
    await searchPage.checkAllFileContents(FILES_DOUBLE);
});

test('bulk submit 2 seqs with 1 & 2 files respectively', async ({ page, groupId, tmpDir }) => {
    test.setTimeout(180_000);
    void groupId;
    const submissionPage = new BulkSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.uploadMetadataFile(METADATA_HEADERS, [
        [ID_1, COUNTRY_1, '2022-12-02'],
        [ID_2, COUNTRY_2, '2022-12-13'],
    ]);
    await submissionPage.uploadExternalFiles(
        RAW_READS,
        { [ID_1]: FILES_SINGLE, [ID_2]: FILES_DOUBLE },
        tmpDir,
    );
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone();
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();
    await searchPage.checkFileContentInModal('cell', COUNTRY_1, FILES_SINGLE);
    await searchPage.checkFileContentInModal('cell', COUNTRY_2, FILES_DOUBLE);
});

test('bulk submit 1 seq: discarding and readding a file', async ({ page, groupId, tmpDir }) => {
    test.setTimeout(180_000);
    void groupId;
    const submissionPage = new BulkSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.uploadMetadataFile(METADATA_HEADERS, [[ID_1, COUNTRY_1, '2023-01-01']]);
    await submissionPage.uploadExternalFiles(RAW_READS, { [ID_1]: FILES_SINGLE }, tmpDir);
    await submissionPage.discardRawReadsFiles();
    await submissionPage.uploadExternalFiles(RAW_READS, { [ID_1]: FILES_DOUBLE }, tmpDir);
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone();
    await reviewPage.checkFilesInReviewDialog(FILES_DOUBLE, Object.keys(FILES_SINGLE));
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();
    await searchPage.checkFileContentInModal('cell', COUNTRY_1, FILES_DOUBLE);
});
