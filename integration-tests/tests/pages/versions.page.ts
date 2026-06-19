import { Page, expect } from '@playwright/test';

/**
 * Page object for the sequence versions page (`/seq/{accession}.{version}/versions`),
 * which lists all released versions of an accession and renders the version diff view.
 */
export class VersionsPage {
    constructor(private page: Page) {}

    async goto(accession: string) {
        await this.page.goto(`/seq/${accession}.1/versions`);
        await this.expectVersionsPageFor(accession);
    }

    async expectVersionsPageFor(accession: string) {
        await expect(this.page.getByText(`Versions for accession ${accession}`)).toBeVisible();
    }

    async expectLatestVersionLabel() {
        await expect(this.page.getByText('Latest version')).toBeVisible();
    }

    async expectPreviousVersionLabel() {
        await expect(this.page.getByText('Previous version')).toBeVisible();
    }

    async clickVersionLink(accessionVersion: string) {
        const link = this.page.getByRole('link', { name: accessionVersion });
        await expect(link).toBeVisible();
        await link.click();
    }

    /**
     * Assert that the version-selection checkboxes are shown (only the case when there
     * are three or more versions; with two versions the diff auto-compares).
     */
    async expectVersionSelectionAvailable() {
        await expect(this.page.getByText(/Select two versions to compare/)).toBeVisible();
    }

    /**
     * Toggle the selection checkbox for the given accession version (e.g. 'LOC_X.2').
     */
    async toggleVersionSelection(accessionVersion: string) {
        const row = this.page.getByRole('listitem').filter({ hasText: accessionVersion });
        await row.getByRole('checkbox').click();
    }

    /**
     * Assert the version diff view is comparing the given two versions.
     * With exactly two versions the page auto-compares, so no selection is needed.
     */
    async expectComparingVersions(version1: number, version2: number) {
        await expect(
            this.page.getByRole('heading', {
                name: `Comparing Version ${version1} vs Version ${version2}`,
            }),
        ).toBeVisible();
    }

    private diffRow(fieldLabel: string) {
        return this.page.locator('tr', {
            has: this.page.getByRole('cell', { name: fieldLabel, exact: true }),
        });
    }

    /**
     * Assert that the diff table row for a given field label shows both the old and
     * new values (i.e. the field is reported as changed between the two versions).
     */
    async expectFieldDiff(fieldLabel: string, oldValue: string, newValue: string) {
        const row = this.diffRow(fieldLabel);
        await expect(row).toBeVisible();
        await expect(row).toContainText(oldValue);
        await expect(row).toContainText(newValue);
    }

    /**
     * Toggle the "Show all fields" checkbox, which controls whether unchanged
     * fields are shown in the diff table.
     */
    async toggleShowAllFields() {
        await this.page.getByRole('checkbox', { name: 'Show all fields' }).click();
    }

    /**
     * Assert that a field row is not present in the diff table (e.g. an unchanged
     * field while "Show all fields" is off).
     */
    async expectFieldRowAbsent(fieldLabel: string) {
        await expect(this.diffRow(fieldLabel)).toHaveCount(0);
    }

    /**
     * Assert that a field row is present in the diff table and shows the given value.
     */
    async expectFieldRowVisible(fieldLabel: string, value: string) {
        const row = this.diffRow(fieldLabel);
        await expect(row).toBeVisible();
        await expect(row).toContainText(value);
    }

    /**
     * Assert that a field row is present in the diff table (without checking its value,
     * e.g. a changed sequence-derived field whose exact value is not known up front).
     */
    async expectFieldRowPresent(fieldLabel: string) {
        await expect(this.diffRow(fieldLabel)).toBeVisible();
    }

    /**
     * The `compare` URL search param the diff view persists, e.g. '1,2'.
     */
    getCompareParam(): string | null {
        return new URL(this.page.url()).searchParams.get('compare');
    }
}
