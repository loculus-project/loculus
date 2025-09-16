import { expect, Page } from '@playwright/test';

export interface SeqSetFormValues {
    name: string;
    description: string;
    focalAccessions: string;
    backgroundAccessions: string;
}

export const defaultSeqSetFormValues: Omit<SeqSetFormValues, 'name'> = {
    description: 'Test SeqSet description',
    focalAccessions: 'LOC_00000AE, LOC_000001Y, LOC_000002W',
    backgroundAccessions: 'LOC_000003U, LOC_000004S',
};

export class SeqSetPage {
    constructor(private readonly page: Page) {}

    public async gotoList() {
        await this.page.goto('/seqsets');
        await this.page.waitForLoadState('networkidle');
    }

    public rowLocator(name: string) {
        return this.page.getByTestId(name).first();
    }

    public async gotoDetail(name: string) {
        await this.gotoList();
        const row = this.rowLocator(name);
        await expect(row).toBeVisible({ timeout: 60_000 });
        await row.click();
        await this.page.waitForLoadState('networkidle');
        await expect(this.page.getByRole('heading', { name })).toBeVisible({ timeout: 60_000 });
    }

    private async openCreateModal() {
        const createButton = this.page.getByTestId('AddIcon');
        await expect(createButton).toBeVisible({ timeout: 60_000 });
        await createButton.click();
        await expect(this.page.getByText('Create a SeqSet')).toBeVisible({ timeout: 60_000 });
    }

    private async fillSeqSetForm(values: SeqSetFormValues) {
        await this.page.getByLabel('SeqSet name').fill(values.name);
        await this.page.getByLabel('SeqSet description').fill(values.description);
        await this.page.getByLabel('Focal accessions').fill(values.focalAccessions);
        await this.page.getByLabel('Background accessions').fill(values.backgroundAccessions);
    }

    private async submitForm() {
        await this.page.getByRole('button', { name: 'Save' }).click();
        await this.page.waitForLoadState('networkidle');
    }

    public async createSeqSet(values: SeqSetFormValues) {
        await this.gotoList();
        await this.openCreateModal();
        await this.fillSeqSetForm(values);
        await this.submitForm();
        await expect(this.page.getByRole('heading', { name: values.name })).toBeVisible({
            timeout: 60_000,
        });
    }

    public async deleteSeqSet(name: string) {
        await this.gotoDetail(name);
        await this.deleteCurrentSeqSet();
    }

    public async deleteCurrentSeqSet() {
        await this.page.getByRole('button', { name: 'Delete' }).click();
        await this.page.getByRole('button', { name: 'Confirm' }).click();
        await this.page.waitForLoadState('networkidle');
        await expect(this.page.getByRole('heading', { name: 'SeqSets' })).toBeVisible({
            timeout: 60_000,
        });
    }
}
