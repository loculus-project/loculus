import { Page } from '@playwright/test';

export class SeqSetPage {
    constructor(private page: Page) {}

    async gotoList() {
        await this.page.goto('/seqsets');
    }

    async gotoDetail(seqSetName: string) {
        await this.gotoList();
        await this.page.getByTestId(seqSetName).first().click();
        await this.page.waitForLoadState();
    }

    async createSeqSet(seqSetName: string) {
        await this.gotoList();
        await this.page.getByTestId('AddIcon').waitFor();
        await this.page.getByTestId('AddIcon').click();
        await this.page.getByLabel('SeqSet name').fill(seqSetName);
        await this.page.getByLabel('SeqSet description').fill('Test seqSet description');
        await this.page.getByLabel('Focal accessions').fill('LOC_00000AE, LOC_000001Y');
        await this.page.getByLabel('Background accessions').fill('LOC_000003U, LOC_000004S');
        await this.page.getByRole('button', { name: 'Save' }).click();
        await this.page.waitForLoadState();
    }

    async deleteSeqSet(seqSetName: string) {
        await this.gotoList();
        await this.page.getByText(seqSetName).first().click();
        await this.page.getByRole('button', { name: 'Delete' }).click();
        await this.page.getByRole('button', { name: 'Confirm' }).click();
        await this.page.waitForLoadState();
    }
}
