import { Page, expect } from '@playwright/test';

export class ReviewPage {
    private page: Page;

    private viewFilesButton = () => this.page.getByTestId(/view-files/).first();
    private filesDialog = () => this.page.locator('div:has(> div > h2:text("Files"))').first();
    private filesDialogCloseButton = () => this.filesDialog().getByRole('button', { name: '✕' });

    private viewSequencesButton = () => this.page.getByTestId(/view-sequences-/).first();
    private sequencesDialog = () =>
        this.page.locator('div:has(> div > h2:text("Processed Sequences"))').first();
    private sequencesDialogCloseButton = () =>
        this.sequencesDialog().getByRole('button', { name: '✕' });
    public sequenceViewerContent = () => this.page.getByTestId('fixed-length-text-viewer');
    private sequenceTabs = () => this.page.locator('.tab');

    constructor(page: Page) {
        this.page = page;
    }

    async waitForZeroProcessing() {
        await expect(this.page.locator('body')).toContainText('0 awaiting processing', {
            timeout: 33000,
        });
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
        await expect(button).toBeVisible({ timeout: 15000 });
        await button.click();
        await expect(this.sequencesDialog()).toBeVisible();
        return this.sequencesDialog();
    }

    async viewFiles() {
        const button = this.viewFilesButton();
        await expect(button).toBeVisible({ timeout: 15000 });
        await button.click();
        await expect(this.filesDialog()).toBeVisible();
        return this.filesDialog();
    }

    async closeSequencesDialog() {
        await this.sequencesDialogCloseButton().click();
        await expect(this.sequencesDialog()).not.toBeVisible();
    }

    async closeFilesDialog() {
        await this.filesDialogCloseButton().click();
        await expect(this.filesDialog()).not.toBeVisible();
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
