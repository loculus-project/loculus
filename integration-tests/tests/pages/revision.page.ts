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
     * Complete the full revision submission flow
     * Accepts terms and submits
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
