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
        const alignedTab = this.page.getByRole('button', { name: /aligned/i });
        await expect(unalignedTab.or(alignedTab).first()).toBeVisible({ timeout });
    }

    async selectUnalignedTab() {
        const unalignedTab = this.page.getByRole('button', { name: /unaligned/i });
        if (await unalignedTab.isVisible()) {
            await unalignedTab.click();
        }
    }

    async selectAlignedTab() {
        const alignedTab = this.page.getByRole('button', { name: /aligned/i });
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

    async expectNotLatestVersionBanner() {
        await expect(
            this.page.getByText('This is not the latest version of this sequence entry'),
        ).toBeVisible();
    }

    async expectNoNotLatestVersionBanner() {
        await expect(
            this.page.getByText('This is not the latest version of this sequence entry'),
        ).not.toBeVisible();
    }
}
