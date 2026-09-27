import { expect, Page } from '@playwright/test';
import { ReviewPage } from './review.page';
import {
    contentForUpload,
    prepareTmpDirForSingleUpload,
    uploadFilesFromTmpDir,
} from '../utils/file-upload-helpers';
import { waitForUrlReportingAlerts } from '../utils/navigation-helpers';

const CONFIRMATION_DIALOG_TEXT = 'Do you really want to submit?';

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

    private async clickSubmitAndConfirm() {
        await this.page.getByRole('button', { name: /proceed to Approval/ }).click();
        await expect(this.page.getByText(CONFIRMATION_DIALOG_TEXT)).toBeVisible();
        await this.page.getByRole('button', { name: 'Confirm' }).click();
    }

    async submitChanges() {
        await this.clickSubmitAndConfirm();
        await waitForUrlReportingAlerts(this.page, '**/review', { timeout: 15_000 });
        return new ReviewPage(this.page);
    }

    /**
     * Attempts to submit, expecting the submission to be refused client-side with an error toast.
     * Dismisses the toast, which is shown with autoClose disabled, and stays on the edit page.
     */
    async submitChangesExpectingError(error: string | RegExp) {
        await this.clickSubmitAndConfirm();

        const toast = this.page.getByRole('alert').filter({ hasText: error });
        await expect(toast).toBeVisible();
        await toast.getByLabel('close').click();
        await expect(toast).toHaveCount(0);
        await expect(this.page.getByText(CONFIRMATION_DIALOG_TEXT)).toHaveCount(0);
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
            buffer: Buffer.from(contentForUpload(fileName, content)),
        });
    }

    async confirmReplaceFile() {
        await expect(this.page.getByText(/already exist and will be replaced/)).toBeVisible();
        await this.page.getByRole('button', { name: 'Replace' }).click();
    }

    async discardExtraFile(fileCategory: string, fileName: string) {
        await this.page.getByTestId(`discard_${fileCategory}_${fileName}`).click();
    }

    async expectExtraFileUploaded(fileCategory: string, fileName: string) {
        await expect(this.page.getByTestId(`status_${fileCategory}_${fileName}`)).toHaveText('✓');
    }

    async expectExtraFileDiscarded(fileCategory: string, fileName: string) {
        await expect(this.page.getByTestId(`discard_${fileCategory}_${fileName}`)).toHaveCount(0);
    }
}
