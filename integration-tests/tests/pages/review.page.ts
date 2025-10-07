import { Page, expect } from '@playwright/test';
import { NavigationPage } from './navigation.page';

export class ReviewPage {
    private page: Page;
    private navigation: NavigationPage;

    private viewFilesButton = () => this.page.getByTestId(/view-files/).first();
    private filesDialog = () => this.page.locator('div:has(> div > h2:text("Files"))').first();
    private filesDialogCloseButton = () => this.filesDialog().getByRole('button', { name: '✕' });

    private viewSequencesButton = () => this.page.getByTestId(/view-sequences-/).first();
    private sequencesDialog = () =>
        this.page.locator('div:has(> div > h2:text("Processed sequences"))').first();
    private sequencesDialogCloseButton = () =>
        this.sequencesDialog().getByRole('button', { name: '✕' });
    public sequenceViewerContent = () => this.page.getByTestId('fixed-length-text-viewer');
    private sequenceTabs = () => this.page.locator('.tab');

    constructor(page: Page) {
        this.page = page;
        this.navigation = new NavigationPage(page);
    }

    async waitForZeroProcessing() {
        await expect(this.page.locator('[data-testid="review-page-control-panel"]')).toContainText(
            '0 awaiting processing',
            { timeout: 60000 },
        );
    }

    async navigateToReviewPage() {
        await this.page.goto('/');
        await this.navigation.openOrganismNavigation();
        await this.navigation.selectOrganism('Ebola Sudan');
        await this.navigation.clickSubmitSequences();
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
        await expect(this.sequencesDialog()).toBeHidden();
    }

    async closeFilesDialog() {
        await this.filesDialogCloseButton().click();
        await expect(this.filesDialog()).toBeHidden();
    }

    async switchSequenceTab(tabName: string) {
        const tabs = this.sequenceTabs();
        const tab = tabs.filter({ hasText: tabName }).first();
        await expect(tab).toBeVisible();
        await tab.click();
    }

    async getSequenceContent() {
        const content = this.sequenceViewerContent();
        await expect(content).toBeVisible();
        return content.textContent();
    }

    async getAvailableSequenceTabs(): Promise<string[]> {
        const tabs = this.sequenceTabs();
        const count = await tabs.count();
        const tabNames: string[] = [];

        for (let i = 0; i < count; i++) {
            const tabText = await tabs.nth(i).textContent();
            if (tabText) tabNames.push(tabText.trim());
        }

        return tabNames;
    }
}
