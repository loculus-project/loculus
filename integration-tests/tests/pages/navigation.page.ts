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

    async waitForOrganismNavigationLink(linkText: string) {
        const organismNavigation = this.page.getByRole('navigation', { name: 'Organism navigation' });
        await organismNavigation.waitFor({ state: 'visible' });
        await organismNavigation.getByRole('link', { name: linkText, exact: true }).waitFor({ state: 'visible' });
    }

    async clickOrganismNavigationLink(linkText: string) {
        await this.waitForOrganismNavigationLink(linkText);
        await this.page
            .getByRole('navigation', { name: 'Organism navigation' })
            .getByRole('link', { name: linkText, exact: true })
            .click();
    }

    async clickSubmitSequences() {
        await this.clickOrganismNavigationLink('Submit sequences');
    }
}
