import type { Locator, Page } from '@playwright/test';

import { baseUrl, dummyOrganism } from '../../e2e.fixture';
import { routes } from '../../../src/routes.ts';
import type { FilterValue } from '../../../src/types/config.ts';

const ACCESSION_VERSION = 'Accession version';

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
        await this.page.goto(`${baseUrl}${routes.searchPage(dummyOrganism.key)}`);
    }

    public async clickSearchButton() {
        await this.searchButton.click();
    }

    public async clickResetButton() {
        await this.resetButton.click();
    }

    // Note: This only gets a locator when the field is empty
    public getEmptyAccessionVersionField() {
        return this.page.getByPlaceholder(ACCESSION_VERSION, { exact: true });
    }

    public getFilledAccessionVersionField() {
        return this.page.getByLabel(ACCESSION_VERSION, { exact: true });
    }

    public async searchFor(params: FilterValue[]) {
        await this.page.goto(`${baseUrl}${routes.searchPage(dummyOrganism.key, params)}`);
    }
}
