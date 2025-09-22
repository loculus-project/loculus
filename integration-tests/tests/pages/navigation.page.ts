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
        return this.page.getByRole('link', { name, exact: true }).first();

    }

    async selectOrganism(name: string) {
        const organismOption = this.organismOption(name);
        await organismOption.waitFor({ state: 'visible' });
        await organismOption.click();
    }

    async expectTitle(title: string) {
        await expect(this.page).toHaveTitle(new RegExp(`^${title}`));
    }

    async waitForOrganismNavigationLink(linkText: string) {
        const organismNavigation = this.page.getByRole('navigation', { name: 'Organism navigation' });
        await organismNavigation.waitFor({ state: 'visible' });
        await this.organismOption(linkText).waitFor({ state: 'visible' });
    }

    async clickOrganismNavigationLink(linkText: string) {
        await this.waitForOrganismNavigationLink(linkText);
        await this.organismOption(linkText).click();
    }

    async clickSubmitSequences() {
        await this.clickOrganismNavigationLink('Submit sequences');
    }
}
