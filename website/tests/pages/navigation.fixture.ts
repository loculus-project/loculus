import { expect } from '../e2e.fixture.ts';
import type { Page } from '@playwright/test';

export class NavigationFixture {
    constructor(public readonly page: Page) {}

    public async clickLink(name: string) {
        await this.page.getByRole('link', { name: name, exact: true }).click();
    }

    public async openOrganismNavigation() {
        await this.page.getByText('Choose Organism').click();
    }

    public async expectTitle(title: string) {
        await expect(this.page).toHaveTitle(title);
    }
}
