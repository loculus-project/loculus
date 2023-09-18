import type { Page } from '@playwright/test';

import { baseUrl, testuser } from '../../e2e.fixture';

export type SubmitResponse = { sequenceId: number; customId: string };
export class UserPage {
    constructor(public readonly page: Page) {}

    public async goto() {
        await this.page.goto(`${baseUrl}/user/${testuser}`);
    }

    public async gotoUserSequencePage() {
        await this.page.goto(`${baseUrl}/user/${testuser}/sequences`);
        const countOfDifferentStatuses = 6;
        for (const id of Array.from({ length: countOfDifferentStatuses }, (_, i) => i + 1)) {
            await this.page.locator(`div:nth-child(${id}) > input`).click();
        }
    }

    public async gotoUserPageAndLocateSequenceWithStatus(sequenceId: number, status: string) {
        await this.page.goto(`${baseUrl}/user/${testuser}/sequences`);
        const countOfDifferentStatuses = 6;
        for (const id of Array.from({ length: countOfDifferentStatuses }, (_, i) => i + 1)) {
            await this.page.locator(`div:nth-child(${id}) > input`).click();
        }
        return this.page.getByRole('row', { name: `${sequenceId}`, exact: false }).getByRole('cell', { name: status });
    }
}
