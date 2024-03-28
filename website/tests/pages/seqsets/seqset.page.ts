import type { Page } from '@playwright/test';

import { baseUrl } from '../../e2e.fixture';
import { testSeqSet } from '../../testData/seqSet';

export class SeqSetPage {
    constructor(public readonly page: Page) {}

    public async gotoList() {
        await this.page.goto(`${baseUrl}/seqsets`, { waitUntil: 'load' });
        await this.waitForLoad();
    }

    public async gotoDetail(seqSetName: string = testSeqSet.name) {
        await this.gotoList();
        await this.page.getByText(seqSetName).first().click();
        await this.waitForLoad();
    }

    public async waitForLoad() {
        await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 });
        await this.page.waitForLoadState('load', { timeout: 30000 });
        await this.page.waitForLoadState('networkidle', { timeout: 5000 });
    }

    public async createTestSeqSet(seqSetName: string = testSeqSet.name) {
        await this.gotoList();
        await this.page.getByTestId('AddIcon').waitFor();
        await this.page.getByTestId('AddIcon').click();
        await this.page.locator('#seqSet-name').fill(seqSetName);
        await this.page.locator('#seqSet-description').fill(testSeqSet.description);
        await this.page.locator('#loculus-focal-accession-input').fill(testSeqSet.focalLoculusAccessions);
        await this.page.locator('#loculus-background-accession-input').fill(testSeqSet.backgroundLoculusAccessions);
        await this.page.getByRole('button', { name: 'Save' }).click();
        await this.waitForLoad();
    }

    public async deleteTestSeqSet(seqSetName: string = testSeqSet.name) {
        await this.gotoList();
        await this.page.getByText(seqSetName).first().click();
        await this.page.getByRole('button', { name: 'Delete' }).click();
        await this.page.getByRole('button', { name: 'Confirm' }).click();
        await this.waitForLoad();
    }
}
