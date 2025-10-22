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

        await this.page.waitForTimeout(500);

        await this.page.getByRole('option').first().click({ timeout: 15000 });

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
        await accessionField.click();
        await accessionField.fill(accessions);
    }

    async resetSearchForm() {
        await this.page.getByRole('button', { name: 'Reset' }).click();
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

    /**
     * Navigate to search page filtered by group ID
     * This ensures we only see sequences belonging to a specific group
     */
    async searchByGroupId(organism: string, groupId: number) {
        await this.page.goto(`/${organism}/search?visibility_groupId=true&groupId=${groupId}`);
    }

    /**
     * Get all accessions from the current search results (without version)
     * Returns an array of accession strings like ["LOC_0000001", "LOC_0000002"]
     * Returns empty array if no sequences are found (useful for polling)
     */
    async getAccessions(): Promise<string[]> {
        // Check if any sequence rows exist (don't fail if they don't)
        const rows = this.getSequenceRows();
        const count = await rows.count();

        if (count === 0) {
            return [];
        }

        const accessions: string[] = [];
        for (let i = 0; i < count; i++) {
            const rowText = await rows.nth(i).innerText();
            // Match accession with version (LOC_XXXXXXX.1) and extract just the accession part
            const match = rowText.match(/LOC_[A-Z0-9]+/);
            if (match) {
                accessions.push(match[0]);
            }
        }

        return accessions;
    }

    /**
     * Wait for sequences to appear in search results after they've been released
     * This handles the delay between release and indexing in the search system
     * @param minCount Minimum number of sequences expected
     * @param timeoutMs Maximum time to wait in milliseconds (default 60 seconds)
     * @returns Array of accessions found
     */
    async waitForSequencesInSearch(minCount: number, timeoutMs: number = 60000): Promise<string[]> {
        let accessions: string[] = [];
        await expect
            .poll(
                async () => {
                    await this.page.reload();
                    accessions = await this.getAccessions();
                    return accessions.length;
                },
                {
                    message: `Expected at least ${minCount} sequences to appear in search results`,
                    timeout: timeoutMs,
                    intervals: [2000, 5000],
                },
            )
            .toBeGreaterThanOrEqual(minCount);
        return accessions;
    }
}
