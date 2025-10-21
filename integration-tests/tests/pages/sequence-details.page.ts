import { Page, expect } from '@playwright/test';

export class SequenceDetailsPage {
    constructor(private page: Page) {}

    async navigateToSequence(accessionVersion: string) {
        await this.page.goto(`/seq/${accessionVersion}`);
    }

    async loadSequences() {
        const loadButton = this.page.getByRole('button', { name: /Load sequences/ });
        await loadButton.click();
    }

    async selectSegment(segmentName: string) {
        const tab = this.page.getByRole('tab', { name: new RegExp(segmentName, 'i') });
        await tab.click();
    }

    getNotLatestVersionBanner() {
        return this.page.getByText(/This is not the latest version/);
    }

    getRevocationBanner() {
        return this.page.getByText(/This sequence entry has been revoked/);
    }

    getRevocationVersionBanner() {
        return this.page.getByText(/This is a revocation/);
    }

    async gotoAllVersions() {
        const versionsLink = this.page.getByRole('link', { name: /View all versions/ });
        await versionsLink.click();
    }

    async expectSequenceVisible(sequenceSubstring: string) {
        await expect(this.page.getByText(sequenceSubstring, { exact: false })).toBeVisible();
    }

    async expectSequenceNotVisible(sequenceSubstring: string) {
        await expect(this.page.getByText(sequenceSubstring, { exact: false })).not.toBeVisible();
    }
}
