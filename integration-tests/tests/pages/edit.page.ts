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
        await this.page.getByRole('button', { name: 'Submit' }).click();
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
}
