import { Page, expect } from '@playwright/test';
import { NavigationPage } from './navigation.page';
import { getFromLinkTargetAndAssertContent } from '../utils/link-helpers';
import { SearchPage } from './search.page';

type ReviewPageOverview = {
    processed: number;
    total: number;
};

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

    public readonly approveAllButton = () =>
        this.page.getByRole('button', { name: 'Release', exact: false });
    public readonly discardOpenMenuButton = () =>
        this.page.getByRole('button', { name: 'Discard sequences', exact: false });
    public readonly discardAllButton = () => this.page.getByText('Discard all', { exact: false });
    public readonly confirmReleaseButton = () =>
        this.page.getByRole('button', { name: 'Release', exact: true });
    public readonly confirmDiscardButton = () =>
        this.page.getByRole('button', { name: 'Discard', exact: true });

    constructor(page: Page) {
        this.page = page;
        this.navigation = new NavigationPage(page);
    }

    async goto(groupId: number) {
        await this.page.goto(`/ebola-sudan/submission/${groupId}/review`);
    }

    async getReviewPageOverview(): Promise<ReviewPageOverview> {
        const nothingToReview = this.page.getByText(
            'You do not currently have any unreleased sequences awaiting review.',
        );
        const sequencesProcessed = this.page.getByText('sequences processed');
        await expect(nothingToReview.or(sequencesProcessed)).toBeVisible();

        const nothingToReviewIsVisible = await nothingToReview.isVisible();
        if (nothingToReviewIsVisible) {
            return { processed: 0, total: 0 };
        }
        const infoText = await sequencesProcessed.textContent();

        const matchResult = infoText?.match(/(\d+) of (\d+) sequences processed/) ?? null;

        if (matchResult !== null) {
            const processed = parseInt(matchResult[1], 10);
            const total = parseInt(matchResult[2], 10);

            return { processed, total };
        } else {
            throw new Error('Unable to extract processed sequences information from the page.');
        }
    }

    async waitForTotalSequenceCountCorrect(
        expectedTotal: number,
        comparator: 'less' | 'equal' = 'equal',
        retries: number = 10,
        delayInSeconds: number = 1,
    ) {
        let currentTotal;
        for (let i = 0; i < retries; i++) {
            await new Promise((resolve) => setTimeout(resolve, delayInSeconds * 1000));

            currentTotal = (await this.getReviewPageOverview()).total;
            if (comparator === 'equal' && currentTotal === expectedTotal) {
                return true;
            }
            if (comparator === 'less' && currentTotal < expectedTotal) {
                return true;
            }
        }
        throw new Error(
            `Sequence count ${currentTotal} not ${comparator} expected count ${expectedTotal}`,
        );
    }

    async approveAll() {
        await expect(this.approveAllButton()).toBeVisible();
        await this.approveAllButton().click();
        await expect(this.confirmReleaseButton()).toBeVisible();
        await this.confirmReleaseButton().click();
    }

    async discardAll() {
        await expect(this.discardOpenMenuButton()).toBeVisible();
        await this.discardOpenMenuButton().click();
        await this.discardAllButton().click();
        await expect(this.confirmDiscardButton()).toBeVisible();
        await this.confirmDiscardButton().click();
    }

    async waitForZeroProcessing() {
        await expect(this.page.locator('[data-testid="review-page-control-panel"]')).toContainText(
            '0 awaiting processing',
            { timeout: 90000 },
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

    async releaseAndGoToReleasedSequences(): Promise<SearchPage> {
        await this.releaseValidSequences();
        await this.page.getByRole('link', { name: 'released sequences' }).click();
        return new SearchPage(this.page);
    }

    async checkFilesInReviewDialog(
        presentFiles: Record<string, string>,
        absentFiles: string[] = [],
    ) {
        const filesDialog = await this.viewFiles();
        for (const [fileName, fileContent] of Object.entries(presentFiles)) {
            await expect(filesDialog.getByText(fileName)).toBeVisible();
            if (fileContent) {
                await getFromLinkTargetAndAssertContent(
                    this.page.getByRole('link', { name: fileName }),
                    fileContent,
                );
            }
        }
        for (const fileName of absentFiles) {
            await expect(filesDialog.getByText(fileName)).not.toBeVisible();
        }
        await this.closeFilesDialog();
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
