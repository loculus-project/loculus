import type { Page } from '@playwright/test';

import { baseUrl, testDatasetId } from '../../e2e.fixture';

export type SubmitResponse = { sequenceId: number; customId: string };
export class DatasetPage {
    constructor(public readonly page: Page) {}

    public async gotoList() {
        await this.page.goto(`${baseUrl}/datasets`, { waitUntil: 'load' });
    }

    public async gotoDetail() {
        await this.page.goto(`${baseUrl}/datasets/${testDatasetId}`, { waitUntil: 'load' });
    }

    public async waitForLoad() {
        await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 });
        await this.page.waitForLoadState('load', { timeout: 30000 });
        await this.page.waitForLoadState('networkidle', { timeout: 5000 });
    }
}
