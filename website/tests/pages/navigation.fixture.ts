import type { Page } from '@playwright/test';

import { expect } from '../e2e.fixture.ts';

export class NavigationFixture {
    constructor(public readonly page: Page) {}

    public async clickLink(name: string) {
        await this.page.getByRole('link', { name, exact: true }).click();
    }

    public async openOrganismNavigation() {
        await this.page.getByRole('button', { name: 'Organisms' }).click();
    }

    public async selectOrganism(name: string) {
        await this.page.locator('a').filter({ hasText: name }).first().click();
    }

    public async expectTitle(title: string) {
        await expect(this.page).toHaveTitle(new RegExp(`^${title}`));
    }
}
