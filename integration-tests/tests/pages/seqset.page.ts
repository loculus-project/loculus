import { expect, type Download, type Page } from '@playwright/test';

export type SeqSetFormInput = {
    name: string;
    description?: string;
    focalAccessions: string[];
    backgroundAccessions?: string[];
};

export type SeqSetExportFormat = 'json' | 'tsv';

export class SeqSetPage {
    public constructor(public readonly page: Page) {}

    async gotoList() {
        await this.page.goto('/seqsets');
        await this.page.waitForLoadState('networkidle');
    }

    getCreateButton() {
        return this.page.getByTestId('AddIcon');
    }

    async openCreateDialog() {
        const createButton = this.getCreateButton();
        await expect(createButton).toBeVisible();
        await createButton.click();
        await this.page.locator('#seqSet-name').waitFor({ state: 'visible' });
    }

    async createSeqSet(input: SeqSetFormInput) {
        await this.openCreateDialog();
        await this.fillSeqSetForm(input);
        await this.submitSeqSetForm();
    }

    async fillSeqSetForm(input: SeqSetFormInput) {
        await this.page.locator('#seqSet-name').fill(input.name);

        if (input.description !== undefined) {
            await this.page.locator('#seqSet-description').fill(input.description);
        }

        if (input.focalAccessions.length > 0) {
            await this.page
                .locator('#loculus-focal-accession-input')
                .fill(input.focalAccessions.join(', '));
        }

        if (input.backgroundAccessions !== undefined && input.backgroundAccessions.length > 0) {
            await this.page
                .locator('#loculus-background-accession-input')
                .fill(input.backgroundAccessions.join(', '));
        }
    }

    getSaveButton() {
        return this.page.getByRole('button', { name: 'Save' });
    }

    async submitSeqSetForm() {
        await this.getSaveButton().click();
    }

    /**
     * The form validates the accessions 1 s after the last change. Call this before filling the form, and await the
     * returned promise to wait until that validation request has finished and the form had time to handle it.
     */
    async waitForRecordValidation(accession: string) {
        const response = await this.page.waitForResponse(
            (response) =>
                response.url().includes('/validate-seqset-records') &&
                (response.request().postData() ?? '').includes(accession),
        );
        await response.finished();
        // When validation fails, the form logs the error (another request) before it shows it and disables Save.
        // When it succeeds, nothing changes in the UI, so there is nothing to wait for: give the form time instead,
        // like a user who pauses before clicking Save.
        await this.page.waitForTimeout(3000);
        return response;
    }

    async expectAccessionMatchesUrl() {
        const url = this.page.url();
        const accession = url.split('/seqsets/')[1];
        expect(accession).toBeTruthy();
        await expect(this.page.getByRole('heading', { name: accession })).toBeVisible();
    }

    async expectDetailLayout(name: string, description: string, version: string) {
        await this.page.waitForURL(new RegExp(`/seqsets/.+\\.${version}$`));
        await this.expectAccessionMatchesUrl();
        await expect(this.page.getByRole('button', { name: 'Export' })).toBeVisible();
        await expect(this.page.getByRole('button', { name: 'Edit' })).toBeVisible();
        await expect(this.page.getByRole('button', { name: 'Delete' })).toBeVisible();
        await expect(this.page.getByText('Name', { exact: true })).toBeVisible();
        await expect(this.page.getByText(name, { exact: true })).toBeVisible();
        await expect(this.page.getByText('Description', { exact: true })).toBeVisible();
        await expect(this.page.getByText(description, { exact: true })).toBeVisible();
        await expect(this.page.getByText('Version', { exact: true })).toBeVisible();
        await expect(this.page.getByText('Size', { exact: true })).toBeVisible();
        await expect(this.page.getByText('Accession', { exact: true })).toBeVisible();
        await this.expectCreatorDetailsInModal();
    }

    async expectCreatorDetailsInModal() {
        await expect(this.page.getByText('Created by', { exact: true })).toBeHidden();
        await this.page.getByRole('button', { name: 'More details' }).click();
        await expect(this.page.getByRole('heading', { name: 'Creator details' })).toBeVisible();
        await expect(this.page.getByText('Created by', { exact: true })).toBeVisible();
        await expect(this.page.getByText('Created date', { exact: true })).toBeVisible();
        await this.page.keyboard.press('Escape');
        await expect(this.page.getByRole('heading', { name: 'Creator details' })).toBeHidden();
    }

    async exportSeqSet(format: SeqSetExportFormat): Promise<Download> {
        await this.page.getByRole('button', { name: 'Export' }).click();

        const formatRadio = this.page.getByTestId(format === 'json' ? 'json-radio' : 'tsv-radio');
        await expect(formatRadio).toBeVisible();
        await formatRadio.click();

        const [download] = await Promise.all([
            this.page.waitForEvent('download'),
            this.page.getByRole('button', { name: 'Download' }).click(),
        ]);

        await this.closeModal();
        return download;
    }

    async closeModal() {
        await this.page.keyboard.press('Escape');
        await expect(this.page.getByRole('button', { name: 'Download' })).toBeHidden();
    }

    async openDeleteDialog() {
        await this.page.getByRole('button', { name: 'Delete' }).click();
        await expect(this.page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    }

    async cancelDeletion() {
        await this.page.getByRole('button', { name: 'Cancel' }).click();
        await expect(this.page.getByRole('button', { name: 'Cancel' })).toBeHidden();
    }

    async deleteSeqSet() {
        await this.openDeleteDialog();
        await this.page.getByRole('button', { name: 'Confirm' }).click();
        await this.page.waitForURL(/\/seqsets$/);
        await this.page.waitForLoadState('networkidle');
    }

    async editSeqSet(newName: string, newDescription: string) {
        await this.page.getByRole('button', { name: 'Edit' }).click();
        const nameField = this.page.locator('#seqSet-name');
        await nameField.waitFor({ state: 'visible' });
        await nameField.fill(newName);
        const descriptionField = this.page.locator('#seqSet-description');
        await descriptionField.waitFor({ state: 'visible' });
        await descriptionField.fill(newDescription);
        await this.page.getByRole('button', { name: 'Save' }).click();
        await expect(this.page.getByText(newName, { exact: true })).toBeVisible();
    }
}
