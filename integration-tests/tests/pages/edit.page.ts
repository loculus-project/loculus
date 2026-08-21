import { expect, Page } from '@playwright/test';
import { ReviewPage } from './review.page';
import { prepareTmpDirForSingleUpload, uploadFilesFromTmpDir } from '../utils/file-upload-helpers';

export class EditPage {
    constructor(private page: Page) {}

    async goto(organism: string, accession: string, version: number) {
        await this.page.goto(`/${organism}/submission/edit/${accession}/${version}`);
    }

    async discardSequenceFile() {
        await this.page.getByRole('button', { name: 'Discard file' }).click();
    }

    async discardSequenceFileByTestId(testId: string) {
        await this.page.getByTestId(testId).click();
    }

    async addSequenceFile(content: string, name = 'example.txt') {
        await this.page.getByLabel(/Add a segment/).setInputFiles({
            name,
            mimeType: 'text/plain',
            buffer: Buffer.from(content),
        });
    }

    async fillField(fieldName: string, value: string) {
        await this.page.getByRole('textbox', { name: fieldName }).fill(value);
    }

    async submitChanges() {
        await this.page.getByRole('button', { name: /proceed to Approval/ }).click();
        await expect(this.page.getByText('Do you really want to submit?')).toBeVisible();
        await this.page.getByRole('button', { name: 'Confirm' }).click();
        await this.page.waitForURL('**/review', { timeout: 15_000 });
        return new ReviewPage(this.page);
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

    async addAdditionalFile(fileCategory: string, fileName: string, content: string) {
        await this.page.getByTestId(`add_${fileCategory}`).setInputFiles({
            name: fileName,
            mimeType: 'text/plain',
            buffer: Buffer.from(content),
        });
    }

    async confirmReplaceFile() {
        await expect(this.page.getByText(/already exist and will be replaced/)).toBeVisible();
        await this.page.getByRole('button', { name: 'Replace' }).click();
    }

    async discardExtraFile(fileCategory: string, fileName: string) {
        await this.page.getByTestId(`discard_${fileCategory}_${fileName}`).click();
    }

    /**
     * Waits for a file to have been uploaded *in this session*. Asserting on the '✓' icon is not
     * enough: a file carried over from the previous version renders the same icon, so replacing a
     * file leaves the old row satisfying the assertion while the new upload is still in flight.
     */
    async expectExtraFileUploaded(fileCategory: string, fileName: string) {
        await expect(this.page.getByTestId(`status_${fileCategory}_${fileName}`)).toHaveAttribute(
            'data-upload-status',
            'uploaded',
        );
    }

    /** Waits for a file to be present as a reused upload from the previous version. */
    async expectExtraFileReused(fileCategory: string, fileName: string) {
        await expect(this.page.getByTestId(`status_${fileCategory}_${fileName}`)).toHaveAttribute(
            'data-upload-status',
            'previousUpload',
        );
    }

    async expectExtraFileDiscarded(fileCategory: string, fileName: string) {
        await expect(this.page.getByTestId(`discard_${fileCategory}_${fileName}`)).toHaveCount(0);
    }
}
