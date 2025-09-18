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
        const combo = this.page.getByRole('combobox', { name: fieldLabel }).first();

        await combo.click();

        await combo.focus();
        await combo.press('Control+a');
        await combo.pressSequentially(option);

        const optionLocator = this.page
            .getByRole('option', { name: new RegExp(`^${option}`) })
            .first();

        await expect(optionLocator).toBeVisible({ timeout: 5000 });
        await optionLocator.click();

        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(200);
    }

    async clearSelect(fieldLabel: string) {
        await this.page.getByLabel(`Clear ${fieldLabel}`).click();
    }

    async enableSearchFields(...fieldLabels: string[]) {
        await this.page.getByRole('button', { name: 'Add search fields' }).click();
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
        const combo = this.page.getByRole('combobox', { name: 'Mutations' }).first();
        await combo.click();
        await combo.fill(mutation);

        const optionRegex = new RegExp(`^${mutation}(\\([0-9,]+\\))?$`);
        const matchingOption = this.page.getByRole('option', { name: optionRegex }).first();

        await matchingOption.click({ timeout: 2000 });

        await this.page.keyboard.press('Escape');
    }

    async enterAccessions(accessions: string) {
        // Target the main accession textbox (avoid header/nav widgets)
        const accessionField = this.page.getByRole('textbox', {
            name: 'Accession',
            exact: true,
        });
        await expect(accessionField).toBeEnabled({ timeout: 30000 });
        await accessionField.click();
        await accessionField.fill(accessions);
    }

    async resetSearchForm() {
        await this.page.getByRole('button', { name: 'Reset' }).click();
        await this.waitForResults();
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

    async waitForResults() {
        await expect(this.getSequenceRows().first()).toBeVisible({ timeout: 30000 });
    }

    async getAccessionFromRow(rowIndex: number): Promise<string> {
        const row = this.getSequenceRows().nth(rowIndex);
        await expect(row, 'Expected at least one sequence row to be visible').toBeVisible({
            timeout: 30000,
        });

        const rowText = await row.innerText();
        const accessionMatch = rowText.match(/LOC_[A-Z0-9]+\.[0-9]+/);

        expect(accessionMatch, 'Failed to extract accession from sequence row').not.toBeNull();

        return accessionMatch[0];
    }

    async getAccessions(count: number): Promise<string[]> {
        const accessions: string[] = [];
        for (let index = 0; index < count; index++) {
            const accession = await this.getAccessionFromRow(index);
            accessions.push(accession);
        }

        return accessions;
    }

    async getCellText(rowIndex: number, cellIndex: number): Promise<string> {
        const row = this.getSequenceRows().nth(rowIndex);
        await expect(row, 'Expected the requested row to be visible').toBeVisible({
            timeout: 30000,
        });

        const cell = row.locator('td').nth(cellIndex);
        await expect(cell, 'Expected the requested cell to be visible').toBeVisible({
            timeout: 30000,
        });

        return (await cell.innerText()).trim();
    }

    async getCountryFromRow(rowIndex: number): Promise<string> {
        // The "Collection country" column is currently the fourth cell (index 3)
        return this.getCellText(rowIndex, 3);
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
