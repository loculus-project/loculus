import { expect, Page } from '@playwright/test';

export class MyAccountPage {
    constructor(private readonly page: Page) {}

    async goto() {
        await this.page.goto('/');
        await this.page.getByRole('link', { name: 'My account' }).click();
        await this.page.waitForURL(/\/user/);
    }

    private groupListItem(groupName: string) {
        return this.page.locator('li').filter({ hasText: groupName });
    }

    async expectGroupVisible(groupName: string) {
        await expect(this.groupListItem(groupName).first()).toBeVisible();
    }

    async expectGroupNotVisible(groupName: string) {
        await expect(this.groupListItem(groupName)).toHaveCount(0);
    }

    async openGroup(groupName: string) {
        const groupItem = this.groupListItem(groupName);
        await groupItem.first().getByRole('link').click();
        await this.page.waitForURL(/\/group\//);
    }
}
