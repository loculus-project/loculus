import type { Page } from '@playwright/test';

import { baseUrl } from '../../e2e.fixture';
import { testDataset } from '../../testData/dataset';

export class DatasetPage {
    constructor(public readonly page: Page) {}

    public async gotoList() {
        await this.page.goto(`${baseUrl}/datasets`, { waitUntil: 'load' });
        await this.waitForLoad();
    }

    public async gotoDetail(datasetName: string = testDataset.name) {
        await this.gotoList();
        await this.page.getByText(datasetName).first().click();
        await this.waitForLoad();
    }

    public async waitForLoad() {
        await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 });
        await this.page.waitForLoadState('load', { timeout: 30000 });
        await this.page.waitForLoadState('networkidle', { timeout: 5000 });
    }

    public async createTestDataset(datasetName: string = testDataset.name) {
        await this.gotoList();
        await this.page.getByTestId('AddIcon').waitFor();
        await this.page.getByTestId('AddIcon').click();
        await this.page.locator('#dataset-name').fill(datasetName);
        await this.page.locator('#dataset-description').fill(testDataset.description);
        await this.page.locator('#Loculus-accession-input').fill(testDataset.loculusAccessions);
        await this.page.getByRole('button', { name: 'Save' }).click();
        await this.waitForLoad();
    }

    public async deleteTestDataset(datasetName: string = testDataset.name) {
        await this.gotoList();
        await this.page.getByText(datasetName).first().click();
        await this.page.getByRole('button', { name: 'Delete' }).click();
        await this.page.getByRole('button', { name: 'Confirm' }).click();
        await this.waitForLoad();
    }
}
