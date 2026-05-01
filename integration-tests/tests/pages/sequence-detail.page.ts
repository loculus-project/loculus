import { Page, expect } from '@playwright/test';

export class SequenceDetailPage {
    constructor(private page: Page) {}

    async goto(accessionVersion: string) {
        await this.page.goto(`/seq/${accessionVersion}`);
        await expect(this.page.getByRole('heading', { name: accessionVersion })).toBeVisible();
    }

    private get unalignedTab() {
        return this.page.getByRole('button', { name: /unaligned/i });
    }

    private get alignedTab() {
        return this.page.getByRole('button', { name: /^aligned/i }).first();
    }

    async waitForSequenceTabs(timeout = 30000) {
        await expect(this.unalignedTab.or(this.alignedTab).first()).toBeVisible({ timeout });
    }

    async selectUnalignedTab() {
        if (await this.unalignedTab.isVisible()) {
            await this.unalignedTab.click();
        }
    }

    async selectAlignedTab() {
        if (await this.alignedTab.isVisible()) {
            await this.alignedTab.click();
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
}
