import { Page } from '@playwright/test';

export class SeqSetPage {
    constructor(private page: Page) {}

    async navigateToList() {
        await this.page.goto('/seqsets');
    }

    async createSeqSet(name: string, description: string, accessions: string) {
        await this.navigateToList();
        await this.page.getByTestId('AddIcon').click();
        const nameInput = this.page.getByLabel('SeqSet name');
        await nameInput.waitFor({ state: 'visible' });
        await nameInput.fill(name);
        await this.page.getByLabel('SeqSet description').fill(description);
        await this.page.getByLabel(/Focal accessions/).fill(accessions);
        await this.page.getByRole('button', { name: 'Save' }).click();
        await this.page.waitForURL(/\/seqsets\//);
    }
}
