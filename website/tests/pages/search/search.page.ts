import type { Locator, Page } from '@playwright/test';

import { routes } from '../../../src/routes/routes.ts';
import { baseUrl, dummyOrganism } from '../../e2e.fixture';

export const ACCESSION = 'Accession';

export class SearchPage {
    public readonly searchButton: Locator;
    public readonly table: Locator;
    public readonly resetButton: Locator;

    constructor(public readonly page: Page) {
        this.searchButton = page.getByRole('button', { name: 'Search sequences' });
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

    public getAccessionField() {
        return this.page.getByLabel(ACCESSION, { exact: true });
    }

    public async searchFor(params: { name: string; filterValue: string }[]) {
        await this.page.goto(
            `${baseUrl}${routes.searchPage(dummyOrganism.key)}${params
                .map((param) => `&${param.name}=${param.filterValue}`)
                .join('')}`,
        );
    }

    public async getTableContent() {
        const tableData = await this.page.locator('table >> css=tr').evaluateAll((rows) => {
            return rows.map((row) => {
                const cells = Array.from(row.querySelectorAll('td'));
                return cells.map((cell) => cell.textContent!.trim());
            });
        });
        return tableData.slice(1);
    }
}
