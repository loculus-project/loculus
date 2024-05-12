import type { Page } from '@playwright/test';

import { baseUrl } from '../../e2e.fixture';
import { testSeqSet } from '../../testData/seqSet';

export class SeqSetPage {
    constructor(public readonly page: Page) {}

    public async gotoList() {
        await this.page.goto(`${baseUrl}/seqsets`);
    }

    public async gotoDetail(seqSetName: string = testSeqSet.name) {
        await this.gotoList();
        await this.page.getByText(seqSetName).first().click();
        await this.page.waitForLoadState();
    }

    public async createTestSeqSet(seqSetName: string = testSeqSet.name) {
        await this.gotoList();
        await this.page.getByTestId('AddIcon').waitFor();
        await this.page.getByTestId('AddIcon').click();
        await this.page.getByLabel('SeqSet name').fill(seqSetName);
        await this.page.getByLabel('SeqSet description').fill(testSeqSet.description);
        await this.page.getByLabel('Focal accessions').fill(testSeqSet.focalLoculusAccessions);
        await this.page.getByLabel('Background accessions').fill(testSeqSet.backgroundLoculusAccessions);
        await this.page.getByRole('button', { name: 'Save' }).click();
        await this.page.waitForLoadState();
    }

    public async deleteTestSeqSet(seqSetName: string = testSeqSet.name) {
        await this.gotoList();
        await this.page.getByText(seqSetName).first().click();
        await this.page.getByRole('button', { name: 'Delete' }).click();
        await this.page.getByRole('button', { name: 'Confirm' }).click();
        await this.page.waitForLoadState();
    }
}
