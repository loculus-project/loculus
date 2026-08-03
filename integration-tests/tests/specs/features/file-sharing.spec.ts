import { expect } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { test } from '../../fixtures/tmpdir.fixture';
import { EditPage } from '../../pages/edit.page';
import { ReviewPage } from '../../pages/review.page';
import { RevisionPage } from '../../pages/revision.page';
import { SearchPage } from '../../pages/search.page';
import { BulkSubmissionPage, SingleSequenceSubmissionPage } from '../../pages/submission.page';
import {
    EBOLA_SUDAN_SHORT_SEQUENCE,
    EBOLA_SUDAN_SMALL_FASTQ,
    EBOLA_SUDAN_MEDIUM_FASTQ,
} from '../../test-helpers/test-data';

const ORGANISM_NAME = 'Ebola Sudan';
const ORGANISM_URL_NAME = 'ebola-sudan';
const RAW_READS = 'rawReads';
const RAW_READS_FILES_HEADER = `files.${RAW_READS}`;
const METADATA_HEADERS = [
    'submissionId',
    'geoLocCountry',
    'sampleCollectionDate',
    'sequencingInstrument',
];
const AUTHOR_AFFILIATIONS = 'Test Institute';
const COUNTRY_1 = 'Norway';
const COUNTRY_2 = 'Uganda';
const SEQUENCING_INSTRUMENT = 'Illumina MiSeq';
const ID_1 = 'sub1';
const ID_2 = 'sub2';
const FILES_SINGLE = { 'testfile.fastq': EBOLA_SUDAN_SMALL_FASTQ(1) };
const FILES_DOUBLE = {
    'file1.fastq': EBOLA_SUDAN_SMALL_FASTQ(1),
    'file2.fastq': EBOLA_SUDAN_SMALL_FASTQ(2),
};

// Tests upload files in subfolders grouped by submissionId
// TODO: Update integration tests to move away from submission Id subfolders
const filesColumnCell = (submissionId: string, files: Record<string, string>) =>
    Object.keys(files)
        .map((name) => `${name}::${submissionId}/${name}`)
        .join(' ');

test('submit single seq w/ 2 FASTQ files thru single seq submission form', async ({
    page,
    groupId,
    tmpDir,
}) => {
    test.setTimeout(200_000);
    void groupId;
    const submissionPage = new SingleSequenceSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.fillSubmissionForm({
        submissionId: ID_1,
        collectionCountry: COUNTRY_1,
        collectionDate: '2023-10-15',
        authorAffiliations: AUTHOR_AFFILIATIONS,
        sequencingInstrument: SEQUENCING_INSTRUMENT,
    });
    await submissionPage.fillSequenceData({ main: EBOLA_SUDAN_SHORT_SEQUENCE });
    await submissionPage.uploadExternalFiles(RAW_READS, FILES_DOUBLE, tmpDir);
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone(180_000);
    await reviewPage.checkFilesInReviewDialog(FILES_DOUBLE);
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();
    await searchPage.waitForAndOpenModalByRoleAndName('cell', COUNTRY_1);
    await searchPage.checkAllFileContents(FILES_DOUBLE);
});

test('reject non-FASTQ raw_reads file with a format-validation error', async ({
    page,
    groupId,
    tmpDir,
}) => {
    test.setTimeout(200_000);
    void groupId;
    const submissionPage = new SingleSequenceSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.fillSubmissionForm({
        submissionId: 'invalid-format',
        collectionCountry: COUNTRY_1,
        collectionDate: '2023-11-01',
        authorAffiliations: AUTHOR_AFFILIATIONS,
        sequencingInstrument: SEQUENCING_INSTRUMENT,
    });
    await submissionPage.fillSequenceData({ main: EBOLA_SUDAN_SHORT_SEQUENCE });
    await submissionPage.uploadExternalFiles(
        RAW_READS,
        { 'reads.fastq': 'This is not a FASTQ file.' },
        tmpDir,
    );
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone(180_000);
    await reviewPage.expectFileProcessingError(/This is not a FASTQ file./i);
    await reviewPage.expectNoValidSequencesToApprove();
});

test('bulk submit 2 seqs with 1 & 2 FASTQ files respectively', async ({
    page,
    groupId,
    tmpDir,
}) => {
    test.setTimeout(240_000);
    void groupId;
    const submissionPage = new BulkSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.uploadMetadataFile(
        [...METADATA_HEADERS, RAW_READS_FILES_HEADER],
        [
            [ID_1, COUNTRY_1, '2022-12-02', SEQUENCING_INSTRUMENT, filesColumnCell(ID_1, FILES_SINGLE)],
            [ID_2, COUNTRY_2, '2022-12-13', SEQUENCING_INSTRUMENT, filesColumnCell(ID_2, FILES_DOUBLE)],
        ],
    );
    await submissionPage.uploadSequencesFile({
        [ID_1]: EBOLA_SUDAN_SHORT_SEQUENCE,
        [ID_2]: EBOLA_SUDAN_SHORT_SEQUENCE,
    });
    await submissionPage.uploadExternalFiles(
        RAW_READS,
        { [ID_1]: FILES_SINGLE, [ID_2]: FILES_DOUBLE },
        tmpDir,
    );
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone(180_000);
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();
    await searchPage.checkFileContentInModal('cell', COUNTRY_1, FILES_SINGLE);
    await searchPage.checkFileContentInModal('cell', COUNTRY_2, FILES_DOUBLE);
});

test('bulk submit 1 seq: discarding and reading a FASTQ file', async ({
    page,
    groupId,
    tmpDir,
}) => {
    test.setTimeout(240_000);
    void groupId;
    const submissionPage = new BulkSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.uploadMetadataFile(
        [...METADATA_HEADERS, RAW_READS_FILES_HEADER],
        [[ID_1, COUNTRY_1, '2023-01-01', SEQUENCING_INSTRUMENT, filesColumnCell(ID_1, FILES_DOUBLE)]],
    );
    await submissionPage.uploadSequencesFile({ [ID_1]: EBOLA_SUDAN_SHORT_SEQUENCE });
    await submissionPage.uploadExternalFiles(RAW_READS, { [ID_1]: FILES_SINGLE }, tmpDir);
    await submissionPage.discardFiles(RAW_READS);
    await submissionPage.uploadExternalFiles(RAW_READS, { [ID_1]: FILES_DOUBLE }, tmpDir);
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone(180_000);
    await reviewPage.checkFilesInReviewDialog(FILES_DOUBLE, Object.keys(FILES_SINGLE));
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();
    await searchPage.checkFileContentInModal('cell', COUNTRY_1, FILES_DOUBLE);
});

test('bulk submit 1 seq with a 35 MB FASTQ file', async ({ page, groupId, tmpDir }) => {
    test.setTimeout(400_000);
    void groupId;

    // With 10 MB per part, 35 MB will require 4 parts, allowing us to check that the multipart
    // upload functions as expected.
    const FILE_SIZE_MB = 35_000_000;
    const PATTERN = EBOLA_SUDAN_SMALL_FASTQ(1, 1);
    const REPEATS = FILE_SIZE_MB / PATTERN.length;
    const largeFileContent = [];
    for (let i = 0; i < REPEATS; i++) {
        largeFileContent.push(EBOLA_SUDAN_SMALL_FASTQ(1, i + 1));
    }
    const LARGE_FILE = { 'large_file.fastq': largeFileContent.join('') };

    const submissionPage = new BulkSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.uploadMetadataFile(
        [...METADATA_HEADERS, RAW_READS_FILES_HEADER],
        [[ID_1, COUNTRY_1, '2024-01-01', SEQUENCING_INSTRUMENT, filesColumnCell(ID_1, LARGE_FILE)]],
    );
    await submissionPage.uploadSequencesFile({ [ID_1]: EBOLA_SUDAN_SHORT_SEQUENCE });
    await submissionPage.uploadExternalFiles(RAW_READS, { [ID_1]: LARGE_FILE }, tmpDir);
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone(240_000);
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();
    await searchPage.checkFileContentInModal('cell', COUNTRY_1, LARGE_FILE);
});

test('bulk submit blocks a submission with errors in file linkage or parsing', async ({
    page,
    groupId,
    tmpDir,
}) => {
    test.setTimeout(180_000);
    void groupId;

    const [file1Name, file2Name] = Object.keys(FILES_DOUBLE);
    const file1 = { [file1Name]: FILES_DOUBLE[file1Name] };

    const linkageErrors = [
        {
            metadataFileEntries: 'a::b::c',
            uploadedFiles: undefined,
            error: 'Failed to parse file entry',
        },
        {
            metadataFileEntries: filesColumnCell(ID_1, FILES_DOUBLE),
            uploadedFiles: file1,
            error: `referenced in metadata but not uploaded: ${ID_1}/${file2Name}`,
        },
        {
            metadataFileEntries: filesColumnCell(ID_1, file1),
            uploadedFiles: FILES_DOUBLE,
            error: `uploaded but not referenced in metadata: ${ID_1}/${file2Name}`,
        },
        {
            metadataFileEntries: `${file1Name}::${ID_1}/${file1Name}:some-file-id`,
            uploadedFiles: file1,
            error: `uploaded but the metadata still references an existing file for them: ${ID_1}/${file1Name}`,
        },
    ];

    const submissionPage = new BulkSubmissionPage(page);
    for (const { metadataFileEntries, uploadedFiles, error } of linkageErrors) {
        await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
        await submissionPage.acceptTerms();
        await submissionPage.uploadMetadataFile(
            [...METADATA_HEADERS, RAW_READS_FILES_HEADER],
            [[ID_1, COUNTRY_1, '2023-01-01', metadataFileEntries]],
        );
        if (uploadedFiles !== undefined) {
            await submissionPage.uploadExternalFiles(RAW_READS, { [ID_1]: uploadedFiles }, tmpDir);
        }
        await submissionPage.clickSubmit();

        // Multiple toasts can be shown at the same time
        // For example, the parse error appears on metadata file load, as well as on handle submit
        await expect(page.getByText(error).first()).toBeVisible();
        // A blocked submission returns before the data use terms dialog is shown
        await expect(page.getByRole('button', { name: 'Continue under Open terms' })).toHaveCount(
            0,
        );
    }
});

const REVISION_METADATA_HEADERS = [
    'accession',
    'submissionId',
    'geoLocCountry',
    'sampleCollectionDate',
    'sequencingInstrument',
];
const REVISION_FILES = { 'revised_file.fastq': EBOLA_SUDAN_MEDIUM_FASTQ(1) };
const REVISION_FILES_2 = { 'another_file.fastq': EBOLA_SUDAN_MEDIUM_FASTQ(2) };

test('bulk revise 2 seqs with files', async ({ page, groupId, tmpDir }) => {
    test.setTimeout(400_000);

    const timestamp = Date.now();
    const id1 = `bulk-rev-1-${timestamp}`;
    const id2 = `bulk-rev-2-${timestamp}`;
    const revId1 = `bulk-rev-updated-1-${timestamp}`;
    const revId2 = `bulk-rev-updated-2-${timestamp}`;

    // Step 1: Submit and release 2 sequences
    const submissionPage = new BulkSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.uploadMetadataFile(METADATA_HEADERS, [
        [id1, COUNTRY_1, '2022-01-01', SEQUENCING_INSTRUMENT],
        [id2, COUNTRY_2, '2022-01-02', SEQUENCING_INSTRUMENT],
    ]);
    await submissionPage.uploadSequencesFile({
        [id1]: EBOLA_SUDAN_SHORT_SEQUENCE,
        [id2]: EBOLA_SUDAN_SHORT_SEQUENCE,
    });
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone(180_000);
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
        [accession1, revId1, COUNTRY_1, '2022-02-01', SEQUENCING_INSTRUMENT, filesColumnCell(revId1, REVISION_FILES)],
        [accession2, revId2, COUNTRY_2, '2022-02-02', SEQUENCING_INSTRUMENT, filesColumnCell(revId2, REVISION_FILES_2)],
    ];
    await page.getByTestId('metadata_file').setInputFiles({
        name: 'revision_metadata.tsv',
        mimeType: 'text/plain',
        buffer: Buffer.from(
            [
                [...REVISION_METADATA_HEADERS, RAW_READS_FILES_HEADER].join('\t'),
                ...revisionMetadata.map((r) => r.join('\t')),
            ].join('\n'),
        ),
    });

    // Upload the revised consensus sequences (required since Ebola Sudan has consensus sequences enabled)
    const revisedSequencesFasta = [
        `>${revId1}\n${EBOLA_SUDAN_SHORT_SEQUENCE}`,
        `>${revId2}\n${EBOLA_SUDAN_SHORT_SEQUENCE}`,
    ].join('\n');
    await revisionPage.uploadSequenceFile('revised_sequences.fasta', revisedSequencesFasta);

    // Upload files for each revision
    await revisionPage.uploadExternalFiles(
        RAW_READS,
        { [revId1]: REVISION_FILES, [revId2]: REVISION_FILES_2 },
        tmpDir,
    );
    await revisionPage.submitRevision();

    // Step 3: Verify in review page and release
    const reviewPage2 = new ReviewPage(page);
    await reviewPage2.waitForZeroProcessing(180_000);
    await reviewPage2.releaseValidSequences();

    const searchPage2 = new SearchPage(page);
    await page.goto(
        `/${ORGANISM_URL_NAME}/submission/${groupId}/released?column_submissionId=true`,
    );

    // Check that revised sequences have the files
    await searchPage2.checkFileContentInModal('cell', revId1, REVISION_FILES);
    await searchPage2.checkFileContentInModal('cell', revId2, REVISION_FILES_2);
});

test('single revise seq with files via edit page', async ({ page, groupId, tmpDir }) => {
    test.setTimeout(400_000);

    // Step 1: Submit and release a sequence
    const submissionPage = new SingleSequenceSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.fillSubmissionForm({
        submissionId: 'single-rev',
        collectionCountry: COUNTRY_1,
        collectionDate: '2023-01-01',
        authorAffiliations: AUTHOR_AFFILIATIONS,
        sequencingInstrument: SEQUENCING_INSTRUMENT,
    });
    await submissionPage.fillSequenceData({ main: EBOLA_SUDAN_SHORT_SEQUENCE });
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone(180_000);
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
    await reviewPage2.waitForZeroProcessing(180_000);
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

const FILES_TRIPLE: Record<string, string> = {
    'file1.txt': 'Content of file 1.',
    'file2.txt': 'Content of file 2.',
    'file3.txt': 'Content of file 3.',
};
// The same file names as FILES_TRIPLE, with different contents, for a second bulk entry
const OTHER_FILES_TRIPLE: Record<string, string> = {
    'file1.txt': 'Other content of file 1.',
    'file2.txt': 'Other content of file 2.',
    'file3.txt': 'Other content of file 3.',
};
const ADDED_FILE = { 'file4.txt': 'Content of file 4.' };
const REPLACEMENT_CONTENT = 'Replaced content of file 2.';

test('single revise seq via edit page reuses, replaces, discards and adds files', async ({
    page,
    groupId,
    tmpDir,
}) => {
    test.setTimeout(300_000);

    // Step 1: Submit and release a sequence with three files
    const submissionPage = new SingleSequenceSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.fillSubmissionFormDummyOrganism({
        submissionId: 'single-edit-files',
        country: COUNTRY_1,
        date: '2023-01-01',
    });
    await submissionPage.uploadExternalFiles(RAW_READS, FILES_TRIPLE, tmpDir);
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone();
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();

    // Step 2: Reuse, replace, discard and add a file
    const [{ accession, version }] = await searchPage.waitForSequencesInSearch(1);
    const [reusedName, replacedName, discardedName] = Object.keys(FILES_TRIPLE);
    const [addedName, addedContent] = Object.entries(ADDED_FILE)[0];

    const editPage = new EditPage(page);
    await editPage.goto(ORGANISM_URL_NAME, accession, version);

    // Reused file
    await editPage.expectExtraFileUploaded(RAW_READS, reusedName);

    // Replaced file
    await editPage.addAdditionalFile(RAW_READS, replacedName, REPLACEMENT_CONTENT);
    await editPage.confirmReplaceFile();
    await editPage.expectExtraFileUploaded(RAW_READS, replacedName);

    // Discarded file
    await editPage.discardExtraFile(RAW_READS, discardedName);
    await editPage.expectExtraFileDiscarded(RAW_READS, discardedName);

    // Added file
    await editPage.addAdditionalFile(RAW_READS, addedName, addedContent);
    await editPage.expectExtraFileUploaded(RAW_READS, addedName);

    const reviewPage2 = await editPage.submitChanges();
    await reviewPage2.waitForZeroProcessing();
    await reviewPage2.releaseValidSequences();

    // Step 3: The revision serves the reused, replaced and added files, and not the discarded one
    const searchPage2 = new SearchPage(page);
    await searchPage2.goToReleasedSequences(ORGANISM_URL_NAME, groupId);
    await searchPage2.checkFileContentInModal('link', `${accession}.${version + 1}`, {
        [reusedName]: FILES_TRIPLE[reusedName],
        [replacedName]: REPLACEMENT_CONTENT,
        ...ADDED_FILE,
    });
});

test('bulk revise can reuse, replace, discard and add files', async ({ page, groupId, tmpDir }) => {
    test.setTimeout(300_000);

    const [reusedName, replacedName, discardedName] = Object.keys(FILES_TRIPLE);
    const [addedName, addedContent] = Object.entries(ADDED_FILE)[0];

    // Step 1: Bulk submit two entries that use the same file names, with different contents, and
    // release them. Names only have to be unique within an entry, so both are kept apart by path
    const submissionPage = new BulkSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.uploadMetadataFile(
        [...METADATA_HEADERS, RAW_READS_FILES_HEADER],
        [
            [ID_1, COUNTRY_1, '2023-05-01', filesColumnCell(ID_1, FILES_TRIPLE)],
            [ID_2, COUNTRY_2, '2023-05-02', filesColumnCell(ID_2, OTHER_FILES_TRIPLE)],
        ],
    );
    await submissionPage.uploadExternalFiles(
        RAW_READS,
        { [ID_1]: FILES_TRIPLE, [ID_2]: OTHER_FILES_TRIPLE },
        tmpDir,
    );
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone();
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();
    const releasedEntries = await searchPage.waitForSequencesInSearch(2);

    // Each entry serves its own files, despite the file names being identical across the two
    await searchPage.checkFileContentInModal('cell', COUNTRY_1, FILES_TRIPLE);
    await searchPage.checkFileContentInModal('cell', COUNTRY_2, OTHER_FILES_TRIPLE);

    // Step 2: Download the originally submitted metadata
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download originally submitted data/ }).click();
    const download = await downloadPromise;
    const unzipDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-sharing-'));
    let downloadedMetadata: string;
    try {
        execSync(`unzip -o "${await download.path()}" -d "${unzipDir}"`);
        downloadedMetadata = fs.readFileSync(path.join(unzipDir, 'metadata.tsv'), 'utf8');
    } finally {
        fs.rmSync(unzipDir, { recursive: true, force: true });
    }

    const [headerRow, ...entryRows] = downloadedMetadata.split(/\r?\n/).filter((row) => row.trim());
    const headers = headerRow.split('\t');
    const filesColumn = headers.indexOf(RAW_READS_FILES_HEADER);
    const idColumn = headers.indexOf('id');
    expect(
        entryRows,
        `expected both entries in the download, got:\n${downloadedMetadata}`,
    ).toHaveLength(2);
    expect(
        filesColumn,
        `expected a ${RAW_READS_FILES_HEADER} column in: ${headerRow}`,
    ).toBeGreaterThan(-1);

    // Both entries list the same file names, each with their own file ID and no file path
    for (const fileName of Object.keys(FILES_TRIPLE)) {
        expect(downloadedMetadata.split(`${fileName}:`)).toHaveLength(3);
    }
    expect(downloadedMetadata).not.toContain('::');

    // Step 3: Rewrite only the first entry's metadata file entries, so that the second entry reuses
    // all of its files. One entry is reused, one has its file ID removed so the upload replaces it,
    // one is removed, and a new one is added. The replaced and added files keep the submissionId
    // subfolder in their path, so they stay distinct from the second entry's identically named ones
    const uploadedFiles = { [replacedName]: REPLACEMENT_CONTENT, [addedName]: addedContent };

    const revisionMetadata = [
        headerRow,
        ...entryRows.map((row) => {
            const cells = row.split('\t');
            if (cells[idColumn] !== ID_1) return row;

            const reusedEntry = cells[filesColumn]
                .split(' ')
                .find((entry) => entry.startsWith(`${reusedName}:`));
            expect(reusedEntry).toBeDefined();
            cells[filesColumn] = [reusedEntry, filesColumnCell(ID_1, uploadedFiles)].join(' ');
            return cells.join('\t');
        }),
    ].join('\n');

    // Step 4: Bulk submit the revised entries and release them
    const revisionPage = new RevisionPage(page);
    await revisionPage.goto(ORGANISM_URL_NAME, groupId);
    await revisionPage.uploadMetadataFile('revision_metadata.tsv', revisionMetadata);
    await revisionPage.uploadExternalFiles(RAW_READS, { [ID_1]: uploadedFiles }, tmpDir);
    await revisionPage.submitRevision();

    const reviewPage2 = new ReviewPage(page);
    await reviewPage2.waitForZeroProcessing();
    await reviewPage2.releaseValidSequences();

    // Step 5: The revised entry serves the reused, replaced and added files, and not the discarded
    // one, while the untouched entry still serves its own three files under the same names
    const searchPage2 = new SearchPage(page);
    await searchPage2.goToReleasedSequences(ORGANISM_URL_NAME, groupId);

    // Both entries were revised, so wait for the new versions to be indexed before reading files
    for (const { accession, version } of releasedEntries) {
        await searchPage2.waitForAccessionVersionInSearch(accession, version + 1);
    }

    await searchPage2.openModalByRoleAndName('cell', COUNTRY_1);
    await searchPage2.checkAllFileContents({
        [reusedName]: FILES_TRIPLE[reusedName],
        [replacedName]: REPLACEMENT_CONTENT,
        [addedName]: addedContent,
    });
    await expect(page.getByRole('link', { name: discardedName })).toHaveCount(0);
    await searchPage2.closeDetailsModal();

    await searchPage2.checkFileContentInModal('cell', COUNTRY_2, OTHER_FILES_TRIPLE);
});
