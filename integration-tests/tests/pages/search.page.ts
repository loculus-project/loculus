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
        const addButton = this.page.getByRole('button', { name: 'Add Search Fields' });
        // wait for button to be hydrated and visible
        await expect(addButton).toBeVisible({ timeout: 10000 });
        await addButton.click();
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

    getSequenceRows() {
        return this.page.locator('[data-testid="sequence-row"]');
    }

    async clickOnSequenceAndGetAccession(rowIndex = 0): Promise<string | null> {
        const rows = await this.getSequenceRows();
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
