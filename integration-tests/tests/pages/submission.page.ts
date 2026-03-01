import { Page } from '@playwright/test';
import { ReviewPage } from './review.page';
import Papa from 'papaparse';
import { NavigationPage } from './navigation.page';
import {
    prepareTmpDirForBulkUpload,
    prepareTmpDirForSingleUpload,
    uploadFilesFromTmpDir,
} from '../utils/file-upload-helpers';

class SubmissionPage {
    protected page: Page;
    private navigation: NavigationPage;

    constructor(page: Page) {
        this.page = page;
        this.navigation = new NavigationPage(page);
    }

    async navigateToOrganism(organism: string = 'Ebola Sudan') {
        await this.page.goto('/');
        await this.navigation.openOrganismNavigation();
        await this.navigation.selectOrganism(organism);
        await this.navigation.waitForOrganismNavigationLink('Submit sequences');
    }

    async navigateToSubmissionPage(organism: string = 'Ebola Sudan') {
        await this.navigateToOrganism(organism);
        await this.navigation.clickSubmitSequences();

        // Click on the submit upload link
        await this.page.getByRole('link', { name: 'Submit Upload new sequences.' }).click();
    }

    async discardRawReadsFiles() {
        await this.page.getByTestId('discard_raw_reads').click();
    }

    async acceptTerms() {
        await this.page.getByText('I confirm that the data').click();
        await this.page.getByText('I confirm I have not and will').click();
    }

    async selectRestrictedDataUseTerms() {
        const restrictedSelector = '#data-use-restricted';
        await this.page.waitForSelector(restrictedSelector);
        await this.page.click(restrictedSelector);
    }

    // TODO #5357: improve this function by passing in whether we accepted open terms to simplify and also test modal appearance/absence
    async submitSequence(): Promise<ReviewPage> {
        await this.page
            .getByRole('button', { name: 'Submit sequences' })
            .click({ timeout: 10_000 });

        // 'Continue under Open terms' only shows if we are submitting under open terms - but we don't know in this function
        // Void because we're waiting for the review page anyway, so no need to wait for this specifically
        void this.page
            .getByRole('button', { name: 'Continue under Open terms' })
            .click({ timeout: 3_000 })
            .catch(() => {});

        await this.page.waitForURL('**/review', { timeout: 15_000 });
        return new ReviewPage(this.page);
    }

    async submitAndWaitForProcessingDone(): Promise<ReviewPage> {
        await this.acceptTerms();
        const reviewPage = await this.submitSequence();
        await reviewPage.waitForZeroProcessing();
        return reviewPage;
    }
}

export class SingleSequenceSubmissionPage extends SubmissionPage {
    async navigateToSubmissionPage(organism: string = 'Ebola Sudan') {
        await super.navigateToSubmissionPage(organism);
        await this.page.getByRole('link', { name: 'Submit single sequence' }).click();
    }

    async fillSubmissionForm({
        submissionId,
        collectionCountry,
        collectionDate,
        authorAffiliations,
    }: {
        submissionId: string;
        collectionCountry: string;
        collectionDate: string;
        authorAffiliations: string;
    }) {
        await this.page.getByLabel('ID', { exact: true }).fill(submissionId);
        await this.page.getByLabel('Collection country').fill(collectionCountry);
        await this.page.getByLabel('Collection country').blur();
        await this.page.getByLabel('Collection date').fill(collectionDate);
        await this.page.getByLabel('Author affiliations').fill(authorAffiliations);
    }

    async fillSubmissionFormDummyOrganism({
        submissionId,
        country,
        date,
    }: {
        submissionId: string;
        country: string;
        date: string;
    }) {
        await this.page.getByLabel('ID', { exact: true }).fill(submissionId);
        await this.page.getByLabel('Country').fill(country);
        await this.page.getByLabel('Country').blur();
        await this.page.getByLabel('Date').fill(date);
    }

    async fillSequenceData(sequenceData: Record<string, string>) {
        for (const [key, value] of Object.entries(sequenceData)) {
            await this.page.getByLabel(new RegExp('Add a segment', 'i')).setInputFiles({
                name: 'example.txt',
                mimeType: 'text/plain',
                buffer: Buffer.from(`>${key}\n${value}`),
            });
        }
    }

    async uploadExternalFiles(
        fileId: string,
        fileContents: Record<string, string>,
        tmpDir: string,
    ) {
        await prepareTmpDirForSingleUpload(fileContents, tmpDir);
        const fileCount = Object.keys(fileContents).length;
        await uploadFilesFromTmpDir(this.page, fileId, tmpDir, fileCount);
    }

    async completeSubmission(
        {
            submissionId,
            collectionCountry,
            collectionDate,
            authorAffiliations,
            groupId = undefined,
            isRestricted = false,
        }: {
            submissionId: string;
            collectionCountry: string;
            collectionDate: string;
            authorAffiliations: string;
            groupId?: string;
            isRestricted?: boolean;
        },
        sequenceData: Record<string, string>,
    ): Promise<ReviewPage> {
        if (groupId) {
            await this.page.goto(`/ebola-sudan/submission/${groupId}/submit`);
            await this.page.getByRole('link', { name: 'Submit single sequence' }).click();
        } else {
            await this.navigateToSubmissionPage();
        }

        await this.fillSubmissionForm({
            submissionId,
            collectionCountry,
            collectionDate,
            authorAffiliations,
        });
        await this.fillSequenceData(sequenceData);

        if (isRestricted) {
            await this.selectRestrictedDataUseTerms();
        }

        await this.acceptTerms();
        return this.submitSequence();
    }
}

export class BulkSubmissionPage extends SubmissionPage {
    /**
     * Upload a metadata file with the given content.
     * Content is provided as list(s) of strings, and will be formatted into a TSV file.
     * @param headers The header row cells in the TSV file. The column headers need to be valid input field names.
     * @param rows A list of rows. For each row, a value for each column must be given.
     */
    async uploadMetadataFile(headers: string[], rows: (string | number)[][]) {
        const tsvContent = Papa.unparse([headers, ...rows], {
            delimiter: '\t',
            newline: '\n',
        });

        await this.page.getByTestId('metadata_file').setInputFiles({
            name: 'metadata.tsv',
            mimeType: 'text/plain',
            buffer: Buffer.from(tsvContent),
        });
    }

    async uploadSequencesFile(sequenceData: Record<string, string>) {
        const fastaContent = Object.entries(sequenceData)
            .map(([id, sequence]) => `>${id}\n${sequence}`)
            .join('\n');

        await this.page.getByTestId('sequence_file').setInputFiles({
            name: 'sequences.fasta',
            mimeType: 'text/plain',
            buffer: Buffer.from(fastaContent),
        });
    }

    async uploadExternalFiles(
        fileId: string,
        fileContents: Record<string, Record<string, string>>,
        tmpDir: string,
    ) {
        await prepareTmpDirForBulkUpload(fileContents, tmpDir);
        const fileCount = Object.values(fileContents).reduce(
            (total, files) => total + Object.keys(files).length,
            0,
        );
        await uploadFilesFromTmpDir(this.page, fileId, tmpDir, fileCount);
    }

    /**
     * Complete a bulk submission with N sequences using the same or different metadata/sequences.
     *
     * @param options.count - Number of sequences to submit (when using identical data)
     * @param options.metadata - Array of metadata objects for each sequence, or a single object to replicate
     * @param options.sequenceData - Array of sequence data objects, or a single object to replicate
     * @param options.groupId - Optional group ID to submit to a specific group
     * @param options.isRestricted - Whether to use restricted data terms (default: false)
     * @returns ReviewPage after submission completes
     */
    async completeBulkSubmission({
        count,
        metadata,
        sequenceData,
        groupId,
        isRestricted = false,
    }: {
        count?: number;
        metadata:
            | {
                  submissionId: string;
                  collectionCountry: string;
                  collectionDate: string;
                  authorAffiliations: string;
              }
            | Array<{
                  submissionId: string;
                  collectionCountry: string;
                  collectionDate: string;
                  authorAffiliations: string;
              }>;
        sequenceData: Record<string, string> | Array<Record<string, string>>;
        groupId?: string | number;
        isRestricted?: boolean;
    }): Promise<ReviewPage> {
        // Determine the actual count
        const actualCount = Array.isArray(metadata)
            ? metadata.length
            : Array.isArray(sequenceData)
              ? sequenceData.length
              : (count ?? 1);

        // Normalize metadata to array
        const finalMetadata: Array<{
            submissionId: string;
            collectionCountry: string;
            collectionDate: string;
            authorAffiliations: string;
        }> = Array.isArray(metadata)
            ? metadata
            : Array.from({ length: actualCount }, (_, i) => ({
                  ...metadata,
                  submissionId: `${metadata.submissionId}-${i}`,
              }));

        // Normalize sequenceData to array
        const finalSequenceData: Array<Record<string, string>> = Array.isArray(sequenceData)
            ? sequenceData
            : Array.from({ length: actualCount }, () => ({ ...sequenceData }));

        if (groupId) {
            await this.page.goto(`/ebola-sudan/submission/${groupId}/submit`);
        } else {
            await this.navigateToSubmissionPage();
        }

        // Upload metadata
        const headers = [
            'submissionId',
            'collectionCountry',
            'collectionDate',
            'authorAffiliations',
        ];
        const rows = finalMetadata.map((m) => [
            m.submissionId,
            m.collectionCountry,
            m.collectionDate,
            m.authorAffiliations,
        ]);
        await this.uploadMetadataFile(headers, rows);

        // Upload sequences - create FASTA with submission IDs as headers
        const sequenceMap: Record<string, string> = {};
        for (let i = 0; i < actualCount; i++) {
            const seqData = finalSequenceData[i];
            // For single-segment organisms, use just the submission ID
            // For multi-segment, we need to handle the segment names
            for (const [segmentName, sequence] of Object.entries(seqData)) {
                const header =
                    segmentName === 'main'
                        ? finalMetadata[i].submissionId
                        : `${finalMetadata[i].submissionId}_${segmentName}`;
                sequenceMap[header] = sequence;
            }
        }
        await this.uploadSequencesFile(sequenceMap);

        if (isRestricted) {
            await this.selectRestrictedDataUseTerms();
        }

        return this.submitAndWaitForProcessingDone();
    }
}
