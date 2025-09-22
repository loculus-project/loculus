import { Page, expect } from '@playwright/test';

export class NavigationPage {
    constructor(public readonly page: Page) {}

    async clickLink(name: string) {
        await this.page.getByRole('link', { name, exact: true }).first().click();
    }

    async openOrganismNavigation() {
        await this.page.getByRole('button', { name: 'Organisms', exact: true }).click();
    }

    async selectOrganism(name: string) {
        const organismLink = this.page.getByRole('link', { name, exact: true }).first();
        await organismLink.waitFor({ state: 'visible' });
        await organismLink.click();
    }

    async expectTitle(title: string) {
        await expect(this.page).toHaveTitle(new RegExp(`^${title}`));
    }
}
