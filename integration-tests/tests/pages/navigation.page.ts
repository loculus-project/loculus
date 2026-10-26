import { Page, expect } from '@playwright/test';

export class NavigationPage {
    constructor(public readonly page: Page) {}

    async clickLink(name: string) {
        await this.page.getByRole('link', { name, exact: true }).first().click();
    }

    async openOrganismNavigation() {
        await this.page.getByRole('button', { name: 'Organisms', exact: true }).click();
    }

    private organismOption(name: string) {
        // The open menu is rendered in a portal at the end of <body>, so scope to the organism
        // menu itself rather than matching the first link on the page with this name.
        return this.page
            .locator('#organism-menu-items')
            .getByRole('menuitem', { name, exact: true });
    }

    async selectOrganism(name: string) {
        const organismOption = this.organismOption(name);
        await organismOption.waitFor({ state: 'visible', timeout: 10000 });
        await organismOption.click();
    }

    async expectTitle(title: string) {
        await expect(this.page).toHaveTitle(new RegExp(`^${title}`));
    }

    async waitForOrganismNavigationLink(linkText: string) {
        const organismNavigation = this.page.getByRole('navigation', {
            name: 'Organism navigation',
        });
        await organismNavigation.waitFor({ state: 'visible' });
        // For navigation links, we want actual links, not menu items
        await this.page
            .getByRole('link', { name: linkText, exact: true })
            .first()
            .waitFor({ state: 'visible' });
    }

    async clickOrganismNavigationLink(linkText: string) {
        await this.waitForOrganismNavigationLink(linkText);
        // For navigation links, we want actual links, not menu items
        await this.page.getByRole('link', { name: linkText, exact: true }).first().click();
    }

    async clickSubmitSequences() {
        await this.clickOrganismNavigationLink('Submit sequences');
    }
}
