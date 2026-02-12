import { type Locator, type Page, expect } from '@playwright/test';
import { getFromLinkTargetAndAssertContent } from '../utils/link-helpers';
import { EditPage } from './edit.page';
import { ReviewPage } from './review.page';

function makeAccessionVersion({
    accession,
    version,
}: {
    accession: string;
    version: number;
}): AccessionVersion {
    return { accession, version, accessionVersion: `${accession}.${version}` };
}

export type AccessionVersion = { accession: string; version: number; accessionVersion: string };

const accessionVersionRegex = /LOC_[A-Z0-9]+\.[0-9]+/;

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

    async enterovirus() {
        await this.navigateToVirus('Enterovirus');
    }

    async testOrganismWithoutAlignment() {
        await this.navigateToVirus('Test organism (without alignment)');
    }

    private async selectFromAutocomplete(locator: Locator, option: string) {
        await locator.click();
        await locator.focus();
        await locator.press('Control+a');
        await locator.pressSequentially(option);

        await this.page.waitForTimeout(500);

        await this.page.getByRole('option').first().click({ timeout: 15000 });

        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(200);
    }

    async select(fieldLabel: string, option: string) {
        await this.selectFromAutocomplete(
            this.page.getByRole('combobox', { name: fieldLabel }).first(),
            option,
        );
    }

    async selectReference(fieldLabel: string, option: string) {
        await this.selectFromAutocomplete(
            this.page.getByLabel(fieldLabel, { exact: true }),
            option,
        );

        const mutations = this.page.getByRole('combobox', { name: 'Mutations' }).first();
        await expect(mutations).toBeVisible();
        await expect(mutations).toBeEnabled();
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

    async fill(fieldLabel: string, value: string, exact = false) {
        const field = this.page.getByRole('textbox', { name: fieldLabel, exact });
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

    async enterSegmentedMutation(mutation: string, segment: string) {
        const outer = this.page.locator('details', {
            has: this.page.locator('summary', { hasText: 'Sequence Metadata Filters' }),
        });
        const innerS = outer.locator('details', {
            has: this.page.locator('summary', { hasText: new RegExp(`^${segment}$`) }),
        });
        await innerS.locator('summary', { hasText: new RegExp(`^${segment}$`) }).click();
        await expect(innerS).toHaveAttribute('open', '');
        await expect(innerS.getByText('Mutations', { exact: true })).toBeVisible();
        const input = innerS.locator('input#mutField');
        await expect(input).toBeVisible();
        await expect(input).toBeEditable();
        await input.click();
        await input.fill(mutation);
        const optionRegex = new RegExp(`^${mutation}(\\([0-9,]+\\))?$`);
        const matchingOption = innerS.getByRole('option', { name: optionRegex }).first();
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

    getSequenceRows() {
        return this.page.locator('[data-testid="sequence-row"]');
    }

    async clickOnSequence(rowIndex = 0) {
        const rows = this.getSequenceRows();
        await rows.nth(rowIndex).click();
    }

    async openPreviewOfAccessionVersion(accessionVersion: string) {
        await this.getSequenceRows().filter({ hasText: accessionVersion }).click();
    }

    async reviseSequence() {
        // Sometimes clicking revise button doesn't register, so let's wait for sequence viewer to be visible first
        // See #5447
        await expect(this.page.getByTestId('fixed-length-text-viewer')).toBeVisible();

        const reviseButton = this.page.getByRole('link', { name: 'Revise this sequence' });
        await expect(reviseButton).toBeVisible();
        await reviseButton.click();
        await expect(this.page.getByText(/^Create new revision from LOC_\w+\.\d+$/)).toBeVisible();
        return new EditPage(this.page);
    }

    async revokeSequence(revocationReason: string = 'Test revocation') {
        const revokeButton = this.page.getByRole('button', { name: 'Revoke this sequence' });
        await expect(revokeButton).toBeVisible();
        await revokeButton.click();

        await expect(
            this.page.getByText('Are you sure you want to create a revocation for this sequence?'),
        ).toBeVisible();
        await this.page.getByPlaceholder('Enter reason for revocation').fill(revocationReason);
        await this.page.getByRole('button', { name: 'Confirm' }).click();

        return new ReviewPage(this.page);
    }

    async clickOnSequenceAndGetAccession(rowIndex = 0): Promise<string> {
        const rows = this.getSequenceRows();
        const row = rows.nth(rowIndex);
        const rowText = await row.innerText();
        const accessionVersionMatch = rowText.match(accessionVersionRegex);
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

    async waitForSequences(role: 'link' | 'cell', name: string | RegExp) {
        while (!(await this.page.getByRole(role, { name: name }).isVisible())) {
            await this.page.reload();
            await this.page.waitForTimeout(2000);
        }
    }

    async openModalByRoleAndName(role: 'link' | 'cell', name: string | RegExp) {
        await this.page.getByRole(role, { name: name }).click();
    }

    async waitForAndOpenModalByRoleAndName(role: 'link' | 'cell', name: string | RegExp) {
        await this.waitForSequences(role, name);
        await this.openModalByRoleAndName(role, name);
    }

    async checkAllFileContents(fileData: Record<string, string>) {
        for (const [fileName, fileContent] of Object.entries(fileData)) {
            await getFromLinkTargetAndAssertContent(
                this.page.getByRole('link', { name: fileName }),
                fileContent,
            );
        }
    }

    async checkFileContentInModal(
        role: 'link' | 'cell',
        name: string | RegExp,
        fileData: Record<string, string>,
    ) {
        await this.waitForAndOpenModalByRoleAndName(role, name);
        await this.checkAllFileContents(fileData);
        await this.closeDetailsModal();
    }

    async closeDetailsModal() {
        await this.page.getByTestId('close-preview-button').click();
    }

    async searchByGroupId(organism: string, groupId: number) {
        await this.page.goto(`/${organism}/search?visibility_groupId=true&groupId=${groupId}`);
    }

    async goToReleasedSequences(organism: string, groupId: number | string) {
        await this.page.goto(`/${organism}/submission/${groupId}/released`);
    }

    async getAccessionVersions(): Promise<AccessionVersion[]> {
        const rows = this.getSequenceRows();
        const count = await rows.count();

        if (count === 0) {
            return [];
        }

        const accessions: AccessionVersion[] = [];
        for (let i = 0; i < count; i++) {
            const rowText = await rows.nth(i).innerText();
            const match = rowText.match(accessionVersionRegex);
            if (match) {
                const [accession, version] = match[0].split('.');
                accessions.push(
                    makeAccessionVersion({ accession, version: Number.parseInt(version) }),
                );
            }
        }

        return accessions;
    }

    /**
     * Wait for sequences to appear in search after release (handles indexing delay)
     */
    async waitForSequencesInSearch(
        minCount: number,
        timeoutMs: number = 60000,
    ): Promise<AccessionVersion[]> {
        let accessions: AccessionVersion[] = [];
        await expect
            .poll(
                async () => {
                    await this.page.reload();
                    accessions = await this.getAccessionVersions();
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

    async waitForAccessionVersionInSearch(expectedAccession: string, expectedVersion: number) {
        await expect
            .poll(
                async () => {
                    await this.page.reload();
                    const accessionVersions = await this.getAccessionVersions();
                    return accessionVersions.some(
                        ({ accession, version }) =>
                            accession === expectedAccession && version === expectedVersion,
                    );
                },
                {
                    message: `Did not find accession version ${expectedAccession}.${expectedVersion} in search results`,
                    timeout: 60000,
                    intervals: [2000, 5000],
                },
            )
            .toBeTruthy();
    }

    async expectResultTableCellText(text: string) {
        await expect(this.page.getByRole('cell', { name: text })).toBeVisible();
    }
}
