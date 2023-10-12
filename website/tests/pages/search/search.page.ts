import type { Locator, Page } from '@playwright/test';

import { baseUrl } from '../../e2e.fixture';

const ACCESSION = 'Accession';

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
    public getEmptyAccessionField() {
        return this.page.getByPlaceholder(ACCESSION, { exact: true });
    }

    public getFilledAccessionField() {
        return this.page.getByLabel(ACCESSION, { exact: true });
    }

    public async searchFor(params: { [key: string]: string }) {
        await this.page.goto(`${baseUrl}/search?${new URLSearchParams(params)}`);
    }
}
