import { Page, expect } from '@playwright/test';

export class ReviewPage {
    private page: Page;


    private viewSequencesButton = () =>
        this.page.getByTestId(/view-sequences-/).first();
    private sequencesDialog = () =>
        this.page.locator('div:has(> div > h2:text("Processed Sequences"))').first();
    private sequencesDialogCloseButton = () =>
        this.sequencesDialog().getByRole('button', { name: '✕' });
    private sequenceViewerContent = () => this.page.getByTestId('fixed-length-text-viewer');
    private sequenceTabs = () => this.page.locator('.tab');

    constructor(page: Page) {
        this.page = page;
    }

    async navigateToReviewPage() {
        await this.page.getByRole('link', { name: 'Submit' }).click();
        await this.page.getByRole('link', { name: 'Ebola Sudan' }).click();
        await this.page.getByRole('link', { name: "Review Review your group's" }).click();
    }

    async releaseValidSequences() {
        await this.page.getByRole('button', { name: /Release \d+ valid sequence/ }).click();
        await this.page.getByRole('button', { name: 'Release', exact: true }).click();
    }

    async viewSequences() {
        const button = this.viewSequencesButton();
        await expect(button).toBeVisible({ timeout: 30000 }); // Increase timeout to allow for processing
        await button.click();
        await expect(this.sequencesDialog()).toBeVisible({ timeout: 10000 });
        return this.sequencesDialog();
    }

    async closeSequencesDialog() {
        await this.sequencesDialogCloseButton().click();
        await expect(this.sequencesDialog()).not.toBeVisible();
    }

    async switchSequenceTab(tabName: string) {
        const tabs = this.sequenceTabs();
        const tab = await tabs.filter({ hasText: tabName }).first();
        await expect(tab).toBeVisible();
        await tab.click();
    }

    async getSequenceContent() {
        const content = this.sequenceViewerContent();
        await expect(content).toBeVisible();
        return content.textContent();
    }

    async getAvailableSequenceTabs() {
        const tabs = this.sequenceTabs();
        const count = await tabs.count();
        const tabNames = [];

        for (let i = 0; i < count; i++) {
            const tabText = await tabs.nth(i).textContent();
            if (tabText) tabNames.push(tabText.trim());
        }

        return tabNames;
    }
}
