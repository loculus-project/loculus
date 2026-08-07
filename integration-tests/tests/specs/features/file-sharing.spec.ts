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
const FILES_DOUBLE: Record<string, string> = {
    'file1.fastq': EBOLA_SUDAN_SMALL_FASTQ(1),
    'file2.fastq': EBOLA_SUDAN_SMALL_FASTQ(2),
};

// File cells can be formatted either as a list of file names,
// Or file names with file paths under a subfolder
const filesColumnCell = (fileNames: string[], subfolder?: string) =>
    fileNames
        .map((name) => name + (subfolder !== undefined ? `::${subfolder}/${name}` : ''))
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
            [
                ID_1,
                COUNTRY_1,
                '2022-12-02',
                SEQUENCING_INSTRUMENT,
                filesColumnCell(Object.keys(FILES_SINGLE), ID_1),
            ],
            [
                ID_2,
                COUNTRY_2,
                '2022-12-13',
                SEQUENCING_INSTRUMENT,
                filesColumnCell(Object.keys(FILES_DOUBLE), ID_2),
            ],
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
        [
            [
                ID_1,
                COUNTRY_1,
                '2023-01-01',
                SEQUENCING_INSTRUMENT,
                filesColumnCell(Object.keys(FILES_DOUBLE), ID_1),
            ],
        ],
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
        [
            [
                ID_1,
                COUNTRY_1,
                '2024-01-01',
                SEQUENCING_INSTRUMENT,
                filesColumnCell(Object.keys(LARGE_FILE), ID_1),
            ],
        ],
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
            metadataFileEntries: filesColumnCell(Object.keys(FILES_DOUBLE), ID_1),
            uploadedFiles: file1,
            error: `referenced in metadata but not uploaded: ${ID_1}/${file2Name}`,
        },
        {
            metadataFileEntries: filesColumnCell(Object.keys(file1), ID_1),
            uploadedFiles: FILES_DOUBLE,
            error: `uploaded but not referenced in metadata: ${ID_1}/${file2Name}`,
        },
        // TODO: Test shadowed files, which requires uploading files without submission ID
        // subfolders, so that an uploaded file's path matches the name of a reused metadata entry
    ];

    const submissionPage = new BulkSubmissionPage(page);
    for (const { metadataFileEntries, uploadedFiles, error } of linkageErrors) {
        await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
        await submissionPage.acceptTerms();
        await submissionPage.uploadMetadataFile(
            [...METADATA_HEADERS, RAW_READS_FILES_HEADER],
            [[ID_1, COUNTRY_1, '2023-01-01', SEQUENCING_INSTRUMENT, metadataFileEntries]],
        );
        await submissionPage.uploadSequencesFile({
            [ID_1]: EBOLA_SUDAN_SHORT_SEQUENCE,
        });
        if (uploadedFiles !== undefined)
            await submissionPage.uploadExternalFiles(RAW_READS, { [ID_1]: uploadedFiles }, tmpDir);

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
        [
            accession1,
            revId1,
            COUNTRY_1,
            '2022-02-01',
            SEQUENCING_INSTRUMENT,
            filesColumnCell(Object.keys(REVISION_FILES), revId1),
        ],
        [
            accession2,
            revId2,
            COUNTRY_2,
            '2022-02-02',
            SEQUENCING_INSTRUMENT,
            filesColumnCell(Object.keys(REVISION_FILES_2), revId2),
        ],
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

test('single revise seq via edit page reuses, replaces, discards and adds files', async ({
    page,
    groupId,
    tmpDir,
}) => {
    test.setTimeout(300_000);

    // Step 1: Submit and release a sequence with files
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
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone();
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();

    // Step 2: Reuse and replace a file
    const [{ accession, version }] = await searchPage.waitForSequencesInSearch(1);
    const [file1Name, file2Name] = Object.keys(FILES_DOUBLE);

    const editPage = new EditPage(page);
    await editPage.goto(ORGANISM_URL_NAME, accession, version);

    // Reused file 1
    await editPage.expectExtraFileUploaded(RAW_READS, file1Name);

    // Replaced file 2
    await editPage.addAdditionalFile(RAW_READS, file2Name, EBOLA_SUDAN_SMALL_FASTQ(1));
    await editPage.confirmReplaceFile();
    await editPage.expectExtraFileUploaded(RAW_READS, file2Name);

    const reviewPage2 = await editPage.submitChanges();
    await reviewPage2.waitForZeroProcessing();
    await reviewPage2.releaseValidSequences();

    // Step 3: The revision serves the reused and replaced files
    const searchPage2 = new SearchPage(page);
    await searchPage2.goToReleasedSequences(ORGANISM_URL_NAME, groupId);
    await searchPage2.checkFileContentInModal('link', `${accession}.${version + 1}`, {
        [file1Name]: FILES_DOUBLE[file1Name],
        [file2Name]: EBOLA_SUDAN_SMALL_FASTQ(1),
    });

    // Step 4: A second revision discards the reused file and adds a new one
    const addedFileName = 'file3.fastq';
    await editPage.goto(ORGANISM_URL_NAME, accession, version + 1);

    await editPage.discardExtraFile(RAW_READS, file1Name);
    await editPage.expectExtraFileDiscarded(RAW_READS, file1Name);

    await editPage.addAdditionalFile(RAW_READS, addedFileName, EBOLA_SUDAN_SMALL_FASTQ(2));
    await editPage.expectExtraFileUploaded(RAW_READS, addedFileName);

    const reviewPage3 = await editPage.submitChanges();
    await reviewPage3.waitForZeroProcessing();
    await reviewPage3.releaseValidSequences();

    // Step 5: The second revision serves the replaced and added files, but not the discarded one
    await searchPage2.goToReleasedSequences(ORGANISM_URL_NAME, groupId);
    await searchPage2.waitForAccessionVersionInSearch(accession, version + 2);
    await searchPage2.openModalByRoleAndName('link', `${accession}.${version + 2}`);
    await searchPage2.checkAllFileContents({
        [file2Name]: EBOLA_SUDAN_SMALL_FASTQ(1),
        [addedFileName]: EBOLA_SUDAN_SMALL_FASTQ(2),
    });
    await expect(page.getByRole('link', { name: file1Name })).toHaveCount(0);
    await searchPage2.closeDetailsModal();
});

test('bulk revise can reuse, replace, discard and add files', async ({ page, groupId, tmpDir }) => {
    test.setTimeout(300_000);

    // Step 1: Bulk submit two entries
    const submissionPage = new BulkSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(ORGANISM_NAME);
    await submissionPage.uploadMetadataFile(
        [...METADATA_HEADERS, RAW_READS_FILES_HEADER],
        [
            [
                ID_1,
                COUNTRY_1,
                '2023-05-01',
                SEQUENCING_INSTRUMENT,
                filesColumnCell(Object.keys(FILES_DOUBLE), ID_1),
            ],
            [
                ID_2,
                COUNTRY_2,
                '2023-05-02',
                SEQUENCING_INSTRUMENT,
                filesColumnCell(Object.keys(FILES_DOUBLE), ID_2),
            ],
        ],
    );
    await submissionPage.uploadSequencesFile({
        [ID_1]: EBOLA_SUDAN_SHORT_SEQUENCE,
        [ID_2]: EBOLA_SUDAN_SHORT_SEQUENCE,
    });
    await submissionPage.uploadExternalFiles(
        RAW_READS,
        { [ID_1]: FILES_DOUBLE, [ID_2]: FILES_DOUBLE },
        tmpDir,
    );
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone();
    const searchPage = await reviewPage.releaseAndGoToReleasedSequences();
    const releasedEntries = await searchPage.waitForSequencesInSearch(2);

    // Each entry serves its own files, despite the file names being identical across the two
    await searchPage.checkFileContentInModal('cell', COUNTRY_1, FILES_DOUBLE);
    await searchPage.checkFileContentInModal('cell', COUNTRY_2, FILES_DOUBLE);

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

    // Both entries list the same file names, each with their own file IDs
    for (const fileName of Object.keys(FILES_DOUBLE)) {
        expect(downloadedMetadata.split(`${fileName}:`)).toHaveLength(3);
    }
    expect(downloadedMetadata).not.toContain('::');

    // Step 3: The first entry reuses one file and replaces the other
    // The second entry reuses one file, discards the other and adds a new one
    const [file1Name, file2Name] = Object.keys(FILES_DOUBLE);
    const REPLACED_FILE = { [file2Name]: EBOLA_SUDAN_SMALL_FASTQ(3) };
    const ADDED_FILE = { 'file3.fastq': EBOLA_SUDAN_SMALL_FASTQ(2) };
    const uploadedFiles: Record<string, string | Record<string, string>> = {
        // First entry replaces an existing file, uploaded in its submission ID subfolder
        [ID_1]: REPLACED_FILE,
        // Second entry adds a new file, uploaded without a subfolder
        ...ADDED_FILE,
    };

    // Keep the entry's reused file, and declares the newly uploaded files alongside it
    const reviseEntry = (id: string, reusedFileName: string, newFilesCell: string) => {
        const row = entryRows.find((entryRow) => entryRow.split('\t')[idColumn] === id);
        if (row === undefined)
            throw new Error(`expected an entry for ${id} in:\n${downloadedMetadata}`);

        const cells = row.split('\t');
        const reusedEntry = cells[filesColumn]
            .split(' ')
            .find((entry) => entry.startsWith(`${reusedFileName}:`));
        expect(
            reusedEntry,
            `expected a ${reusedFileName} entry for ${id} in: ${cells[filesColumn]}`,
        ).toBeDefined();

        cells[filesColumn] = [reusedEntry, newFilesCell].join(' ');
        return cells.join('\t');
    };

    const revisionMetadata = [
        headerRow,
        reviseEntry(ID_1, file1Name, filesColumnCell(Object.keys(REPLACED_FILE), ID_1)),
        reviseEntry(ID_2, file1Name, filesColumnCell(Object.keys(ADDED_FILE))),
    ].join('\n');

    // Step 4: Bulk submit the revised entries and release them
    const revisionPage = new RevisionPage(page);
    await revisionPage.goto(ORGANISM_URL_NAME, groupId);
    await revisionPage.uploadMetadataFile('revision_metadata.tsv', revisionMetadata);
    await revisionPage.uploadSequenceFile(
        'revised_sequences.fasta',
        [ID_1, ID_2].map((id) => `>${id}\n${EBOLA_SUDAN_SHORT_SEQUENCE}`).join('\n'),
    );
    await revisionPage.uploadExternalFiles(RAW_READS, uploadedFiles, tmpDir);
    await revisionPage.submitRevision();

    const reviewPage2 = new ReviewPage(page);
    await reviewPage2.waitForZeroProcessing();
    await reviewPage2.releaseValidSequences();

    // Step 5: The first entry serves its reused and replaced files, and the second entry serves its
    // reused and added files, but not the discarded one
    const searchPage2 = new SearchPage(page);
    await searchPage2.goToReleasedSequences(ORGANISM_URL_NAME, groupId);

    // Both entries were revised, so wait for the new versions to be indexed before reading files
    for (const { accession, version } of releasedEntries) {
        await searchPage2.waitForAccessionVersionInSearch(accession, version + 1);
    }

    await searchPage2.checkFileContentInModal('cell', COUNTRY_1, {
        [file1Name]: FILES_DOUBLE[file1Name],
        ...REPLACED_FILE,
    });

    await searchPage2.openModalByRoleAndName('cell', COUNTRY_2);
    await searchPage2.checkAllFileContents({ [file1Name]: FILES_DOUBLE[file1Name], ...ADDED_FILE });
    await expect(page.getByRole('link', { name: file2Name })).toHaveCount(0);
    await searchPage2.closeDetailsModal();
});
