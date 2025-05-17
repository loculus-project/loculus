import { Page, expect } from '@playwright/test';

export class NavigationPage {
    constructor(public readonly page: Page) {}

    async clickLink(name: string) {
        await this.page.getByRole('link', { name, exact: true }).click();
    }

    async openOrganismNavigation() {
        await this.page.getByText('Organisms').click();
    }

    async expectTitle(title: string) {
        await expect(this.page).toHaveTitle(new RegExp(`^${title}`));
    }
}
