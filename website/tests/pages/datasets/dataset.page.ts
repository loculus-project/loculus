import type { Page } from '@playwright/test';

import { baseUrl, testDataset } from '../../e2e.fixture';

export type SubmitResponse = { sequenceId: number; customId: string };
export class DatasetPage {
    constructor(public readonly page: Page) {}

    public async gotoList() {
        await this.page.goto(`${baseUrl}/datasets`, { waitUntil: 'load' });
        await this.waitForLoad();
    }

    public async gotoDetail() {
        await this.gotoList();
        await this.page
            .getByText(testDataset?.name)
            .first()
            .click();
        await this.waitForLoad();
    }

    public async waitForLoad() {
        await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 });
        await this.page.waitForLoadState('load', { timeout: 30000 });
        await this.page.waitForLoadState('networkidle', { timeout: 5000 });
    }

    public async createTestDataset() {
        await this.gotoList();
        await this.page.getByTestId('AddToPhotosIcon').waitFor();
        await this.page.getByTestId('AddToPhotosIcon').click();
        await this.page.locator('#dataset-name').fill(testDataset?.name);
        await this.page.locator('#dataset-description').fill(testDataset?.description);
        await this.page.locator('#genbank-accession-input').fill(testDataset?.genbankAccessions);
        await this.page.locator('#sra-accession-input').fill(testDataset?.sraAccessions);
        await this.page.getByRole('button', { name: 'Save' }).click();
        await this.waitForLoad();
    }

    public async deleteLastDataset() {
        await this.gotoList();
        this.page
            .getByText(testDataset?.name)
            .first()
            .click();
        await this.page.getByRole('button', { name: 'Delete' }).click();
        await this.page.getByRole('button', { name: 'Confirm' }).click();
        await this.waitForLoad();
    }
}
