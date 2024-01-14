import type { Locator, Page } from '@playwright/test';

import { baseUrl, dummyOrganism } from '../../e2e.fixture';
import { routes } from '../../../src/routes.ts';
import type { FilterValue } from '../../../src/types/config.ts';

export const ACCESSION_VERSION = 'Accession version';

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

    public async clickTableHeader(headerLabel: string) {
        await this.page.locator(`th:has-text("${headerLabel}")`).click();
    }

    public async getTableContent() {
        const tableData: string[][] = [];
        const rowCount = await this.page.locator('table >> css=tr').count();
        for (let i = 1; i < rowCount; i++) {
            const rowCells = this.page.locator(`table >> css=tr:nth-child(${i}) >> css=td`);
            const cellCount = await rowCells.count();
            const rowData: string[] = [];
            for (let j = 0; j < cellCount; j++) {
                const cellText = await rowCells.nth(j).textContent();
                rowData.push(cellText ?? '');
            }
            tableData.push(rowData);
        }
        return tableData;
    }
}
