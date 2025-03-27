import { Page, expect } from '@playwright/test';

export class SearchPage {
    constructor(private page: Page) {}

    private async navigateToVirus(virus: string) {
        await this.page.goto('/');
        await this.page.getByRole('link', { name: new RegExp(virus) }).click();
    }

    async ebolaSudan() {
        await this.navigateToVirus('Ebola Sudan');
    }

    async cchf() {
        await this.navigateToVirus('Crimean-Congo Hemorrhagic Fever Virus');
    }

    async select(fieldLabel: string, option: string) {
        await this.page.locator('label').filter({ hasText: fieldLabel }).click();
        await this.page.getByRole('option', { name: new RegExp(option) }).click();
        await this.page.waitForTimeout(500); // how can we better ensure that the filter is applied?
    }

    async clearSelect(fieldLabel: string) {
        await this.page.getByLabel(`Clear ${fieldLabel}`).click();
    }

    async enableSearchFields(...fieldLabels: string[]) {
        await this.page.getByRole('button', { name: 'Add Search Fields' }).click();
        for (const label of fieldLabels) {
            await this.page.getByRole('checkbox', { name: label }).check();
        }
        await this.page.getByRole('button', { name: 'Close' }).click();
    }

    async fill(fieldLabel: string, value: string) {
        const field = this.page.getByRole('textbox', { name: fieldLabel });
        await field.fill(value);
        await field.press('Enter');
        await this.page.waitForTimeout(900); // how can we better ensure that the filter is applied?
    }

    async enterMutation(mutation: string) {
        await this.page.getByPlaceholder('Mutations').click();
        await this.page.getByLabel('Mutations').fill(mutation);
        await this.page.getByRole('option', { name: mutation }).click();
    }

    async enterAccessions(accessions: string) {
        await this.page.getByLabel('Accession').click();
        await this.page.getByLabel('Accession').fill(accessions);
    }

    async resetSearchForm() {
        await this.page.getByRole('button', { name: 'reset' }).click();
    }

    async waitForLoculusId(timeout = 60000): Promise<string | null> {
        await this.page.waitForFunction(
            () => {
                const content = document.body.innerText;
                return /LOC_[A-Z0-9]+\.[0-9]+/.test(content);
            },
            { timeout },
        );

        const content = await this.page.content();
        const loculusIdMatch = content.match(/LOC_[A-Z0-9]+\.[0-9]+/);
        const loculusId = loculusIdMatch ? loculusIdMatch[0] : null;
        return loculusId;
    }

    async getSequenceRows() {
        return this.page.locator('[data-testid="sequence-row"]');
    }

    async clickOnSequence(rowIndex = 0) {
        const rows = await this.getSequenceRows();
        await rows.nth(rowIndex).click();
    }

    async getSequencePreviewModal() {
        return this.page.locator('[data-testid="sequence-preview-modal"]');
    }

    async getHalfScreenPreview() {
        return this.page.locator('[data-testid="half-screen-preview"]');
    }

    async toggleHalfScreenButton() {
        return this.page.locator('[data-testid="toggle-half-screen-button"]');
    }

    async closePreviewButton() {
        return this.page.locator('[data-testid="close-preview-button"]');
    }

    async getUrlParams() {
        return new URL(this.page.url()).searchParams;
    }

    async expectSequenceCount(count: number) {
        await expect(
            this.page.getByText(new RegExp(`Search returned ${count} sequence`)),
        ).toBeVisible();
    }
}
