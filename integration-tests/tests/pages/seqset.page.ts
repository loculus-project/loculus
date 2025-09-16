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

    getHeading(name: string) {
        return this.page.getByRole('heading', { name });
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
        await this.submitSeqSetForm(input.name);
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

    async submitSeqSetForm(expectedName: string) {
        await this.page.getByRole('button', { name: 'Save' }).click();
        await expect(this.getHeading(expectedName)).toBeVisible();
    }

    async expectDetailLayout(name: string) {
        await expect(this.getHeading(name)).toBeVisible();
        await expect(this.page.getByRole('button', { name: 'Export' })).toBeVisible();
        await expect(this.page.getByRole('button', { name: 'Edit' })).toBeVisible();
        await expect(this.page.getByRole('button', { name: 'Delete' })).toBeVisible();
        await expect(this.page.getByText('Created date')).toBeVisible();
        await expect(this.page.getByText('Version', { exact: true })).toBeVisible();
        await expect(this.page.getByText('Accession', { exact: true })).toBeVisible();
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

    async editSeqSetName(newName: string) {
        await this.page.getByRole('button', { name: 'Edit' }).click();
        const nameField = this.page.locator('#seqSet-name');
        await nameField.waitFor({ state: 'visible' });
        await nameField.fill(newName);
        await this.page.getByRole('button', { name: 'Save' }).click();
        await expect(this.getHeading(newName)).toBeVisible();
    }
}
