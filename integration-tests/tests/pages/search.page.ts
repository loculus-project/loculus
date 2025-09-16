import { Page, expect } from '@playwright/test';

export class SearchPage {
    constructor(private page: Page) {}

    async navigateToVirus(virus: string) {
        await this.page.goto('/');
        await this.page.getByRole('link', { name: virus }).click();
    }

    async ebolaSudan() {
        await this.navigateToVirus('Ebola Sudan');
    }

    async cchf() {
        await this.navigateToVirus('Crimean-Congo Hemorrhagic Fever Virus');
    }

    async testOrganismWithoutAlignment() {
        await this.navigateToVirus('Test organism (without alignment)');
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
            await this.page.getByRole('checkbox', { name: label, exact: true }).check();
        }
        await this.page.getByTestId('field-selector-close-button').click();
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
        const accessionField = this.getAccessionField();
        await accessionField.click();
        await accessionField.fill(accessions);
    }

    getAccessionField() {
        return this.page.getByRole('textbox', {
            name: 'Accession',
            exact: true,
        });
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

    getSequenceRows() {
        return this.page.locator('[data-testid="sequence-row"]');
    }

    async getAccessionValues(count: number): Promise<string[]> {
        const rows = this.getSequenceRows();
        const availableRows = await rows.count();
        const limit = Math.min(count, availableRows);
        const accessions: string[] = [];

        for (let index = 0; index < limit; index++) {
            const text = await rows.nth(index).innerText();
            const loculusAccessionMatch = text.match(/LOC_[A-Z0-9]+(?:\.[0-9]+)?/);

            if (loculusAccessionMatch !== null) {
                accessions.push(loculusAccessionMatch[0]);
                continue;
            }

            const firstToken = text.trim().split(/\s+/)[0];
            if (firstToken !== undefined && firstToken.length > 0) {
                accessions.push(firstToken);
            }
        }

        return accessions;
    }

    async clickOnSequence(rowIndex = 0) {
        const rows = this.getSequenceRows();
        await rows.nth(rowIndex).click();
    }

    async clickOnSequenceAndGetAccession(rowIndex = 0): Promise<string | null> {
        const rows = this.getSequenceRows();
        const row = rows.nth(rowIndex);
        const rowText = await row.innerText();
        const accessionVersionMatch = rowText.match(/LOC_[A-Z0-9]+\.[0-9]+/);
        const accessionVersion = accessionVersionMatch ? accessionVersionMatch[0] : null;
        await row.click();
        return accessionVersion;
    }

    getSequencePreviewModal() {
        return this.page.locator('[data-testid="sequence-preview-modal"]');
    }

    getHalfScreenPreview() {
        return this.page.locator('[data-testid="half-screen-preview"]');
    }

    toggleHalfScreenButton() {
        return this.page.locator('[data-testid="toggle-half-screen-button"]');
    }

    closePreviewButton() {
        return this.page.locator('[data-testid="close-preview-button"]');
    }

    getUrlParams() {
        return new URL(this.page.url()).searchParams;
    }

    async expectSequenceCount(count: number) {
        await expect(
            this.page.getByText(new RegExp(`Search returned ${count} sequence`)),
        ).toBeVisible();
    }
}
