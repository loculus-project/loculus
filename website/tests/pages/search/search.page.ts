import type { Locator, Page } from '@playwright/test';

import { routes } from '../../../src/routes/routes.ts';
import { baseUrl, dummyOrganism } from '../../e2e.fixture';

export const ACCESSION = 'Accession';

export class SearchPage {
    public readonly table: Locator;
    public readonly resetButton: Locator;

    constructor(public readonly page: Page) {
        this.resetButton = page.getByRole('button', { name: 'reset' });
        this.table = page.getByRole('table');
    }

    public async goto() {
        await this.page.goto(`${baseUrl}${routes.searchPage(dummyOrganism.key)}`);
    }

    public async clickResetButton() {
        await this.resetButton.click();
    }

    public getAccessionField() {
        return this.page.getByLabel(ACCESSION, { exact: true });
    }

    public async searchFor(params: { name: string; filterValue: string }[]) {
        await this.page.goto(
            `${baseUrl}${routes.searchPage(dummyOrganism.key)}?${params
                .map((param) => `&${param.name}=${param.filterValue}`)
                .join('')}`,
        );
    }

    public async getTableContent() {
        const rowLocator = this.page.locator('tr');
        const elementsCount = 4;
        const previousAccessions = [];

        for (let index = 1; index < elementsCount; index++) {
            const element = await rowLocator.nth(index);
            const innerText = await element.innerText();
            previousAccessions.push(innerText.split(' ')[0]);
        }
        return previousAccessions;
    }
}
