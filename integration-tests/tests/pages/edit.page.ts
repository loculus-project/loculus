import { expect, Page } from '@playwright/test';
import { ReviewPage } from './review.page';

export class EditPage {
    constructor(private page: Page) {}

    async discardSequenceFile() {
        await this.page.getByRole('button', { name: 'Discard file' }).click();
    }

    async addSequenceFile(content: string) {
        await this.page.getByLabel(/Add a segment/).setInputFiles({
            name: 'example.txt',
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
}
