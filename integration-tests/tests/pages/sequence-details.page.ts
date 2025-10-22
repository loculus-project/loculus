import { expect, Locator, Page } from '@playwright/test';

export class SequenceDetailsPage {
    public readonly notLatestVersionBanner: Locator;
    public readonly revocationVersionBanner: Locator;
    public readonly revokedSequenceBanner: Locator;

    private readonly loadButton: Locator;
    private readonly allVersionsButton: Locator;
    private readonly versionLink: Locator;
    private readonly specificProteinTab: Locator;
    private readonly geneDropdown: Locator;

    constructor(public readonly page: Page) {
        this.loadButton = this.page.getByRole('button', { name: 'Load sequences' });
        this.specificProteinTab = this.page.getByRole('button', {
            name: 'Aligned amino acid sequences',
        });
        this.geneDropdown = this.page.locator('select');
        this.versionLink = this.page.getByText(/Version \d+/);
        this.allVersionsButton = this.page.getByRole('link', { name: 'All versions' });

        this.notLatestVersionBanner = this.page.getByText(
            'This is not the latest version of this sequence entry.',
        );
        this.revocationVersionBanner = this.page.getByText('This is a revocation version.');
        this.revokedSequenceBanner = this.page.getByText('This sequence entry has been revoked!');
    }

    async goto(accessionVersion: string) {
        await this.page.goto(`/seq/${accessionVersion}`);
        await expect(this.page.getByRole('heading', { name: accessionVersion })).toBeVisible();
    }

    async gotoAllVersions() {
        await expect(this.versionLink).toBeVisible();
        await this.versionLink.click();
        await expect(this.allVersionsButton).toBeVisible();
        await this.allVersionsButton.click();
    }

    async loadSequences() {
        await expect(this.loadButton).toBeVisible({ timeout: 60000 });
        await this.loadButton.click();
    }

    async selectSpecificProtein(proteinName: string) {
        await expect(this.specificProteinTab).toBeVisible();
        await this.specificProteinTab.click();

        await expect(this.geneDropdown).toBeVisible();
        await this.geneDropdown.selectOption(proteinName);
    }

    async selectORF1a() {
        await this.selectSpecificProtein('ORF1a');
    }

    async getSequenceText(): Promise<string> {
        const sequenceElement = this.page.getByTestId('fixed-length-text-viewer');
        await expect(sequenceElement).toBeVisible();
        return (await sequenceElement.textContent()) || '';
    }

    async expectVersionsPageHeading(accession: string) {
        await expect(this.page.getByText(`Versions for accession ${accession}`)).toBeVisible();
    }

    async expectVersionLabels() {
        await expect(this.page.getByText('Latest version')).toBeVisible();
        await expect(this.page.getByText('Previous version')).toBeVisible();
    }

    async clickVersionLink(accessionVersion: string) {
        const link = this.page.getByRole('link', { name: accessionVersion });
        await expect(link).toBeVisible();
        await link.click();
    }
}
