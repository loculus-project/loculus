import type { Locator, Page } from '@playwright/test';

import { routes } from '../../../src/routes.ts';
import { baseUrl, dummyOrganism, expect } from '../../e2e.fixture';

type ReviewPageOverview = {
    processed: number;
    total: number;
};

export class ReviewPage {
    public readonly approveAllButton: Locator;
    public readonly deleteFirstButton: Locator;
    public readonly deleteAllButton: Locator;
    public readonly confirmButton: Locator;

    constructor(public readonly page: Page) {
        this.approveAllButton = page.getByRole('button', { name: 'Release', exact: false });
        this.deleteFirstButton = page.getByRole('button', { name: 'Discard sequences', exact: false });
        this.deleteAllButton = page.getByRole('button', { name: 'Discard all', exact: false });
        this.confirmButton = page.getByRole('button', { name: 'Confirm', exact: false });
    }

    public async goto() {
        await this.page.goto(`${baseUrl}${routes.userSequenceReviewPage(dummyOrganism.key)}`, {
            waitUntil: 'networkidle',
        });
    }

    public async getReviewPageOverview(): Promise<ReviewPageOverview> {
        if (await this.page.getByText('No sequences to review', { exact: false }).isVisible()) {
            return { processed: 0, total: 0 };
        }

        await this.page.waitForSelector(':text("sequences processed.")');

        const infoText = await this.page.$eval(':text("sequences processed.")', (element) => element.textContent);

        const matchResult = infoText?.match(/(\d+) of (\d+) sequences processed/) ?? null;

        if (matchResult !== null) {
            const processed = parseInt(matchResult[1], 10);
            const total = parseInt(matchResult[2], 10);

            return { processed, total };
        } else {
            throw new Error('Unable to extract processed sequences information from the page.');
        }
    }

    public async waitForTotalSequencesFulfillPredicate(
        predicate: (totalSequenceCount: number) => boolean,
        retries: number = 10,
        delayInSeconds: number = 1,
    ) {
        for (let i = 0; i < retries; i++) {
            await new Promise((resolve) => setTimeout(resolve, delayInSeconds * 1000));

            const { total: currentTotal } = await this.getReviewPageOverview();
            if (predicate(currentTotal)) {
                return true;
            }
        }

        throw new Error(`Waiting for total count of sequences to match predicate, but total did not match predicate`);
    }

    public async approveAll() {
        await expect(this.approveAllButton).toBeVisible();
        await this.approveAllButton.click();
        await expect(this.confirmButton).toBeVisible();
        await this.confirmButton.click();
    }

    public async deleteAll() {
        await expect(this.deleteFirstButton).toBeVisible();
        await this.deleteFirstButton.click();
        await expect(this.deleteAllButton).toBeVisible();
        await this.deleteAllButton.click();
        await expect(this.confirmButton).toBeVisible();
        await this.confirmButton.click();
    }
}
