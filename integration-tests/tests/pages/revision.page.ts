import { expect, type Page } from '@playwright/test';
import { prepareTmpDirForBulkUpload, uploadFilesFromTmpDir } from '../utils/file-upload-helpers';

/**
 * Page object for the sequence revision page.
 * Handles revising existing sequences with updated metadata and/or sequence data.
 */
export class RevisionPage {
    constructor(public readonly page: Page) {}

    /**
     * Navigate to the revision page for a specific group
     */
    async goto(organism: string, groupId: number) {
        await this.page.goto(`/${organism}/submission/${groupId}/revise`);
    }

    /**
     * Navigate to revision page from a sequence details page
     * Clicks the "Revise this sequence" link
     */
    async clickReviseSequenceLink() {
        // Sometimes clicking revise button doesn't register, so let's wait for sequence viewer to be visible first
        // See #5447
        await expect(this.page.getByTestId('fixed-length-text-viewer')).toBeVisible();

        await this.page
            .getByRole('link', { name: 'Revise this sequence' })
            .click({ timeout: 15000 });
        await expect(
            this.page.getByRole('heading', { name: 'Create new revision from' }),
        ).toBeVisible();
    }

    /**
     * Upload a sequence file
     */
    async uploadSequenceFile(fileName: string, content: string | Buffer) {
        await this.page.getByTestId('sequence_file').setInputFiles({
            name: fileName,
            mimeType: 'text/plain',
            buffer: typeof content === 'string' ? Buffer.from(content) : content,
        });
        await expect(this.page.getByTestId('discard_sequence_file')).toBeEnabled();
    }

    /**
     * Upload a metadata file
     */
    async uploadMetadataFile(fileName: string, content: string | Buffer) {
        await this.page.getByTestId('metadata_file').setInputFiles({
            name: fileName,
            mimeType: 'text/plain',
            buffer: typeof content === 'string' ? Buffer.from(content) : content,
        });
        await expect(this.page.getByTestId('discard_metadata_file')).toBeEnabled();
    }

    /**
     * Upload a segment file for multi-segment organisms
     */
    async uploadSegmentFile(segmentName: string, fileName: string, content: string | Buffer) {
        await this.page.getByTestId(`${segmentName}_segment_file`).setInputFiles({
            name: fileName,
            mimeType: 'text/plain',
            buffer: typeof content === 'string' ? Buffer.from(content) : content,
        });
        await expect(this.page.getByTestId(`discard_${segmentName}_segment_file`)).toBeEnabled();
    }

    /**
     * Discard a segment file for multi-segment organisms
     */
    async discardSegmentFile(segmentName: string) {
        await this.page.getByTestId(`discard_${segmentName}_segment_file`).click();
    }

    /**
     * Discard the sequence file
     */
    async discardSequenceFile() {
        await this.page.getByTestId('discard_sequence_file').click();
    }

    /**
     * Discard the metadata file
     */
    async discardMetadataFile() {
        await this.page.getByTestId('discard_metadata_file').click();
    }

    /**
     * Accept the data submission terms
     */
    async acceptTerms() {
        await this.page
            .getByText('I confirm I have not and will not submit this data independently to INSDC')
            .click();
        await this.page
            .getByText('I confirm that the data submitted is not sensitive or human-identifiable')
            .click();
    }

    /**
     * Click the Submit button
     */
    async clickSubmit() {
        await this.page.getByRole('button', { name: 'Submit' }).click();
    }

    /**
     * Click the Confirm button in the confirmation dialog
     */
    async clickConfirm() {
        await this.page.getByRole('button', { name: 'Confirm' }).click();
    }

    /**
     * Complete the full revision submission flow
     * Accepts terms, submits, and confirms
     */
    async submitRevision() {
        await this.acceptTerms();
        await this.clickSubmit();
    }

    /**
     * Download metadata template in TSV format
     */
    async downloadTsvTemplate() {
        const downloadPromise = this.page.waitForEvent('download');
        await this.page.getByText('TSV', { exact: true }).click();
        return downloadPromise;
    }

    /**
     * Download metadata template in XLSX format
     */
    async downloadXlsxTemplate() {
        const downloadPromise = this.page.waitForEvent('download');
        await this.page.getByText('XLSX', { exact: true }).click();
        return downloadPromise;
    }

    /**
     * High-level helper: Revise a single-segment sequence
     */
    async reviseSequence(options: {
        sequenceFile?: { name: string; content: string | Buffer };
        metadataFile?: { name: string; content: string | Buffer };
    }) {
        if (options.sequenceFile) {
            await this.uploadSequenceFile(options.sequenceFile.name, options.sequenceFile.content);
        }
        if (options.metadataFile) {
            await this.uploadMetadataFile(options.metadataFile.name, options.metadataFile.content);
        }
        await this.submitRevision();
    }

    /**
     * High-level helper: Revise a multi-segment sequence
     */
    async reviseMultiSegmentSequence(options: {
        segments?: Record<string, { name: string; content: string | Buffer }>;
        metadataFile?: { name: string; content: string | Buffer };
        discardSegments?: string[];
    }) {
        // Discard segments first if specified
        if (options.discardSegments) {
            for (const segment of options.discardSegments) {
                await this.discardSegmentFile(segment);
            }
        }

        // Upload new segment files
        if (options.segments) {
            for (const [segmentName, file] of Object.entries(options.segments)) {
                await this.uploadSegmentFile(segmentName, file.name, file.content);
            }
        }

        // Upload metadata if provided
        if (options.metadataFile) {
            await this.uploadMetadataFile(options.metadataFile.name, options.metadataFile.content);
        }

        await this.submitRevision();
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
}
