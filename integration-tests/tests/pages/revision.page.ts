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
    async goto(organism: string, groupId: number, inputMode?: 'form' | 'bulk') {
        await this.page.goto(
            `/${organism}/submission/${groupId}/revise${inputMode ? '?inputMode=' + inputMode : ''}`,
        );
    }

    /**
     * Look up an individual sequence entry to revise in form mode
     */
    async searchAccessionVersion(accessionVersion: string) {
        await this.page
            .getByRole('textbox', { name: 'Accession of sequence to revise' })
            .fill(accessionVersion);
        await this.page.getByRole('button', { name: 'Find sequence entry' }).click();
    }

    /**
     * Assert the individual sequence entry revision form displays for the accessionVersion
     */
    async expectRevisionFormLoaded(accessionVersion: string) {
        await expect(
            this.page.getByRole('heading', {
                name: new RegExp(`Create new revision from ${accessionVersion}`),
            }),
        ).toBeVisible();
    }

    /**
     * Assert the individual sequence entry revision form is not shown (e.g. after an invalid search)
     */
    async expectRevisionFormNotLoaded() {
        await expect(
            this.page.getByRole('heading', { name: /Create new revision from/ }),
        ).toBeHidden();
    }

    /**
     * Assert the "could not find that sequence entry" search error is shown
     */
    async expectCouldNotAccessionVersionError() {
        await expect(
            this.page.getByText(
                'Could not find that sequence entry. Please check the accession and version and try again.',
            ),
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
     * Click the Upload (submit) button
     */
    async clickSubmit() {
        await this.page.getByRole('button', { name: 'Upload and proceed to Approval' }).click();
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
        await this.page.locator('a[href*="fileType=tsv"]').click();
        return downloadPromise;
    }

    /**
     * Download metadata template in XLSX format
     */
    async downloadXlsxTemplate() {
        const downloadPromise = this.page.waitForEvent('download');
        await this.page.locator('a[href*="fileType=xlsx"]').click();
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
