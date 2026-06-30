import { expect, type Page } from '@playwright/test';

export type AddCitationInput = {
    sourceDOI: string;
    title: string;
    year: number;
    contributors?: string[];
    seqSetAccessionVersions: string[];
};

export class AdminPage {
    public constructor(public readonly page: Page) {}

    async gotoDashboard() {
        await this.page.goto('/admin/dashboard');
        await this.page.waitForLoadState('networkidle');
    }

    async addCitation(input: AddCitationInput) {
        await this.page.locator('#citation-source-doi').fill(input.sourceDOI);
        await this.page.locator('#citation-title').fill(input.title);
        await this.page.locator('#citation-year').fill(String(input.year));
        if (input.contributors !== undefined) {
            await this.page.locator('#citation-contributors').fill(input.contributors.join('\n'));
        }
        await this.page
            .locator('#citation-seqset-accessions')
            .fill(input.seqSetAccessionVersions.join(', '));
        await this.page.getByRole('button', { name: 'Add citation' }).click();
    }

    getCitationRow(sourceDOI: string) {
        return this.page.getByTestId(`citation-row-${sourceDOI}`);
    }

    async expectCitationVisible(sourceDOI: string) {
        await expect(this.getCitationRow(sourceDOI)).toBeVisible();
    }

    async deleteCitation(sourceDOI: string) {
        const row = this.getCitationRow(sourceDOI);
        await row.getByTestId('delete-citation-button').click();
        await expect(row).toBeHidden();
    }
}
