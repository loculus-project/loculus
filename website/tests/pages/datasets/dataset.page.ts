import type { Page } from '@playwright/test';

import { baseUrl } from '../../e2e.fixture';
import { testDataset } from '../../testData/dataset';

export type SubmitResponse = { sequenceId: number; customId: string };
export class DatasetPage {
    constructor(public readonly page: Page) {}

    public async gotoList() {
        await this.page.goto(`${baseUrl}/datasets`, { waitUntil: 'load' });
        await this.waitForLoad();
    }

    public async gotoDetail(overrideName?: string) {
        const datasetName = overrideName ? overrideName : testDataset?.name;

        await this.gotoList();
        await this.page.getByText(datasetName).first().click();
        await this.waitForLoad();
    }

    public async waitForLoad() {
        await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 });
        await this.page.waitForLoadState('load', { timeout: 30000 });
        await this.page.waitForLoadState('networkidle', { timeout: 5000 });
    }

    public async createTestDataset(overrideName?: string) {
        await this.gotoList();
        await this.page.getByTestId('AddToPhotosIcon').waitFor();
        await this.page.getByTestId('AddToPhotosIcon').click();
        const datasetName = overrideName ? overrideName : testDataset?.name;

        await this.page.locator('#dataset-name').fill(datasetName);
        await this.page.locator('#dataset-description').fill(testDataset?.description);
        await this.page.locator('#Pathoplexus-accession-input').fill(testDataset?.genbankAccessions);
        await this.page.locator('#GenBank-accession-input').fill(testDataset?.genbankAccessions);
        await this.page.locator('#SRA-accession-input').fill(testDataset?.sraAccessions);
        await this.page.getByRole('button', { name: 'Save' }).click();
        await this.waitForLoad();
    }

    public async deleteTestDataset(overrideName?: string) {
        const datasetName = overrideName ? overrideName : testDataset?.name;
        await this.gotoList();
        await this.page.getByText(datasetName).first().click();
        await this.page.getByRole('button', { name: 'Delete' }).click();
        await this.page.getByRole('button', { name: 'Confirm' }).click();
        await this.waitForLoad();
    }
}
