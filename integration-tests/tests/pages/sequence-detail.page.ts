import { Page, expect } from '@playwright/test';

export class SequenceDetailPage {
    constructor(private page: Page) {}

    async goto(accessionVersion: string) {
        await this.page.goto(`/seq/${accessionVersion}`);
        await expect(this.page.getByRole('heading', { name: accessionVersion })).toBeVisible();
    }

    async loadSequencesIfNeeded() {
        const loadButton = this.page.getByRole('button', { name: 'Load sequences' });
        if (await loadButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await loadButton.click();
        }
    }

    async waitForSequenceTabs(timeout = 30000) {
        const unalignedTab = this.page.getByRole('button', { name: /unaligned/i });
        const alignedTab = this.page.getByRole('button', { name: /^aligned/i });
        await expect(unalignedTab.or(alignedTab).first()).toBeVisible({ timeout });
    }

    async selectUnalignedTab() {
        const unalignedTab = this.page.getByRole('button', { name: /unaligned/i });
        if (await unalignedTab.isVisible()) {
            await unalignedTab.click();
        }
    }

    async selectAlignedTab() {
        const alignedTab = this.page.getByRole('button', { name: /^aligned/i });
        if (await alignedTab.isVisible()) {
            await alignedTab.click();
        }
    }

    async expectSequenceContentVisible(timeout = 10000) {
        await expect(this.page.getByText(/[ACGTN]{20,}/)).toBeVisible({ timeout });
    }

    async expectRevocationBanner() {
        await expect(this.page.getByText('This sequence entry has been revoked!')).toBeVisible();
    }

    private get notLatestVersionBanner() {
        return this.page.getByText('This is not the latest version of this sequence entry');
    }

    async expectNotLatestVersionBanner() {
        await expect(this.notLatestVersionBanner).toBeVisible();
    }

    async expectNoNotLatestVersionBanner() {
        await expect(this.notLatestVersionBanner).not.toBeVisible();
    }

    async expectRevocationVersionBanner() {
        await expect(this.page.getByText('This is a revocation version.')).toBeVisible();
    }

    async gotoAllVersions() {
        const versionLink = this.page.getByText(/Version \d+/);
        await expect(versionLink).toBeVisible();
        await versionLink.click();

        const allVersionsLink = this.page.getByRole('link', { name: 'All versions' });
        await expect(allVersionsLink).toBeVisible();
        await allVersionsLink.click();
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

    getPage() {
        return this.page;
    }
}
