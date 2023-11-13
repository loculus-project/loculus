import type { Locator, Page } from '@playwright/test';

import { baseUrl } from '../../e2e.fixture';

const SEQUENCE_VERSION = 'Sequence version';

export class SearchPage {
    public readonly searchButton: Locator;
    public readonly table: Locator;
    public readonly resetButton: Locator;

    constructor(public readonly page: Page) {
        this.searchButton = page.getByRole('button', { name: 'Search' });
        this.resetButton = page.getByRole('button', { name: 'reset' });
        this.table = page.getByRole('table');
    }

    public async goto() {
        await this.page.goto(`${baseUrl}/search`);
    }

    public async clickSearchButton() {
        await this.searchButton.click();
    }

    public async clickResetButton() {
        await this.resetButton.click();
    }

    // Note: This only gets a locator when the field is empty
    public getEmptySequenceVersionField() {
        return this.page.getByPlaceholder(SEQUENCE_VERSION, { exact: true });
    }

    public getFilledSequenceVersionField() {
        return this.page.getByLabel(SEQUENCE_VERSION, { exact: true });
    }

    public async searchFor(params: { [key: string]: string }) {
        await this.page.goto(`${baseUrl}/search?${new URLSearchParams(params)}`);
    }
}
