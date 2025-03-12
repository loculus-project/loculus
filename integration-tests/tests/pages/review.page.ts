import { Page } from '@playwright/test';

export class ReviewPage {
    private page: Page;

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
}
