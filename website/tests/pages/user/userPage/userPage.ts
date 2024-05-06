import type { Page } from '@playwright/test';

import { routes } from '../../../../src/routes/routes.ts';
import { baseUrl, expect } from '../../../e2e.fixture.ts';

export class UserPage {
    constructor(public readonly page: Page) {}

    public async goToUserPage() {
        await this.page.goto(`${baseUrl}${routes.userOverviewPage()}`, { waitUntil: 'load' });
        await this.page.waitForURL(`${baseUrl}${routes.userOverviewPage()}`);
    }

    public async logout() {
        await this.page.click('text=Logout');
        await this.page.waitForURL(`${baseUrl}/logout`);
    }

    public async verifyGroupIsNotPresent(uniqueGroupName: string) {
        const group = this.page.locator('li').filter({ hasText: uniqueGroupName });
        await expect(group).not.toBeVisible();
    }
}
