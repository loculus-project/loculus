import { expect } from '@playwright/test';
import { test } from '../../fixtures/tmpdir.fixture';
import { EditPage } from '../../pages/edit.page';
import { ReviewPage } from '../../pages/review.page';
import { RevisionPage } from '../../pages/revision.page';
import { SearchPage } from '../../pages/search.page';
import { BulkSubmissionPage, SingleSequenceSubmissionPage } from '../../pages/submission.page';

const ORGANISM_NAME = 'Test organism (with files)';
const ORGANISM_URL_NAME = 'dummy-organism-with-files';
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

test('bulk submit 1 seq with a 35 MB file', async ({ page, groupId, tmpDir }) => {
    test.setTimeout(100_000);
    void groupId;

    // With 10 MB per part, 35 MB will require 4 parts, allowing us to check that the multipart
    // upload functions as expected.
    const FILE_SIZE_MB = 35_000_000;
    const PATTERN = 'ABCDEFGHIJ'; // 10 bytes
    const REPEATS = FILE_SIZE_MB / PATTERN.length;
    const largeFileContent = PATTERN.repeat(REPEATS);
    const LARGE_FILE = { 'large_file.txt': largeFileContent };

    const submissionPage = new BulkSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.uploadMetadataFile(METADATA_HEADERS, [[ID_1, COUNTRY_1, '2024-01-01']]);
    await submissionPage.uploadExternalFiles(RAW_READS, { [ID_1]: LARGE_FILE }, tmpDir);
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone();
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();
    await searchPage.checkFileContentInModal('cell', COUNTRY_1, LARGE_FILE);
});

const REVISION_METADATA_HEADERS = ['accession', 'submissionId', 'country', 'date'];
const REVISION_FILES = { 'revised_file.txt': 'This is a revised file.' };
const REVISION_FILES_2 = { 'another_file.txt': 'Another revised file content.' };

test('bulk revise 2 seqs with files', async ({ page, groupId, tmpDir }) => {
    test.setTimeout(300_000);

    const timestamp = Date.now();
    const id1 = `bulk-rev-1-${timestamp}`;
    const id2 = `bulk-rev-2-${timestamp}`;
    const revId1 = `bulk-rev-updated-1-${timestamp}`;
    const revId2 = `bulk-rev-updated-2-${timestamp}`;

    // Step 1: Submit and release 2 sequences
    const submissionPage = new BulkSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.uploadMetadataFile(METADATA_HEADERS, [
        [id1, COUNTRY_1, '2022-01-01'],
        [id2, COUNTRY_2, '2022-01-02'],
    ]);
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone();
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();

    // Get the accessions of the released sequences
    const accessionVersions = await searchPage.waitForSequencesInSearch(2);
    const accession1 = accessionVersions.find((av) => av.version === 1)?.accession;
    const accession2 = accessionVersions.find(
        (av) => av.version === 1 && av.accession !== accession1,
    )?.accession;
    expect(accession1).toBeDefined();
    expect(accession2).toBeDefined();

    // Step 2: Bulk revise with files
    const revisionPage = new RevisionPage(page);
    await revisionPage.goto(ORGANISM_URL_NAME, groupId);

    // Upload revision metadata (with accession column)
    const revisionMetadata = [
        [accession1, revId1, COUNTRY_1, '2022-02-01'],
        [accession2, revId2, COUNTRY_2, '2022-02-02'],
    ];
    await page.getByTestId('metadata_file').setInputFiles({
        name: 'revision_metadata.tsv',
        mimeType: 'text/plain',
        buffer: Buffer.from(
            [
                REVISION_METADATA_HEADERS.join('\t'),
                ...revisionMetadata.map((r) => r.join('\t')),
            ].join('\n'),
        ),
    });

    // Upload files for each revision
    await revisionPage.uploadExternalFiles(
        RAW_READS,
        { [revId1]: REVISION_FILES, [revId2]: REVISION_FILES_2 },
        tmpDir,
    );
    await revisionPage.submitRevision();

    // Step 3: Verify in review page and release
    const reviewPage2 = new ReviewPage(page);
    await reviewPage2.waitForZeroProcessing();
    await reviewPage2.releaseValidSequences();

    const searchPage2 = new SearchPage(page);
    await searchPage2.goToReleasedSequences(ORGANISM_URL_NAME, groupId);
    await page.goto(page.url() + '?column_submissionId=true');

    // Check that revised sequences have the files
    await searchPage2.checkFileContentInModal('cell', revId1, REVISION_FILES);
    await searchPage2.checkFileContentInModal('cell', revId2, REVISION_FILES_2);
});

test('single revise seq with files via edit page', async ({ page, groupId, tmpDir }) => {
    test.setTimeout(300_000);

    // Step 1: Submit and release a sequence
    const submissionPage = new SingleSequenceSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.fillSubmissionFormDummyOrganism({
        submissionId: 'single-rev',
        country: COUNTRY_1,
        date: '2023-01-01',
    });
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone();
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();

    // Step 2: Wait until sequence is available and directly go to revise/edit page
    const accessionVersions = await searchPage.waitForSequencesInSearch(1);
    const editPage = new EditPage(page);
    await editPage.goto(
        ORGANISM_URL_NAME,
        accessionVersions[0].accession,
        accessionVersions[0].version,
    );

    // Step 3: Upload files in the edit page
    await editPage.uploadExternalFiles(RAW_READS, REVISION_FILES, tmpDir);
    const reviewPage2 = await editPage.submitChanges();
    await reviewPage2.waitForZeroProcessing();
    await reviewPage2.releaseValidSequences();

    // Step 4: Release and verify files
    const searchPage2 = new SearchPage(page);
    await searchPage2.goToReleasedSequences(ORGANISM_URL_NAME, groupId);
    await searchPage2.checkFileContentInModal(
        'link',
        `${accessionVersions[0].accession}.${accessionVersions[0].version + 1}`,
        REVISION_FILES,
    );
});
