import type { Locator, Page } from '@playwright/test';

import { routes } from '../../../src/routes/routes.ts';
import { baseUrl, dummyOrganism, expect } from '../../e2e.fixture';

type ReviewPageOverview = {
    processed: number;
    total: number;
};

export class ReviewPage {
    public readonly approveAllButton: Locator;
    public readonly deleteFirstButton: Locator;
    public readonly deleteAllButton: Locator;
    public readonly confirmReleaseButton: Locator;
    public readonly confirmDeleteButton: Locator;

    constructor(public readonly page: Page) {
        this.approveAllButton = page.getByRole('button', { name: 'Release', exact: false });
        this.deleteFirstButton = page.getByRole('button', { name: 'Discard sequences', exact: false });
        this.deleteAllButton = page.getByText('Discard all', {
            exact: false,
        });

        this.confirmReleaseButton = page.getByRole('button', { name: 'Release', exact: true });
        this.confirmDeleteButton = page.getByRole('button', { name: 'Discard', exact: true });
    }

    public async goto(groupId: number) {
        await this.page.goto(`${baseUrl}${routes.userSequenceReviewPage(dummyOrganism.key, groupId)}`);
    }

    public async getReviewPageOverview(): Promise<ReviewPageOverview> {
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

    public async waitForTotalSequenceCountCorrect(
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
        throw new Error(`Sequence count ${currentTotal} not ${comparator} expected count ${expectedTotal}`);
    }

    public async approveAll() {
        await expect(this.approveAllButton).toBeVisible();
        await this.approveAllButton.click();
        await expect(this.confirmReleaseButton).toBeVisible();
        await this.confirmReleaseButton.click();
    }

    public async deleteAll() {
        await expect(this.deleteFirstButton).toBeVisible();
        await this.deleteFirstButton.click();
        await this.deleteAllButton.click();
        await expect(this.confirmDeleteButton).toBeVisible();
        await this.confirmDeleteButton.click();
    }
}
