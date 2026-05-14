import { expect, Page } from '@playwright/test';

export class MyAccountPage {
    constructor(private readonly page: Page) {}

    async goto() {
        await this.page.goto('/');
        await this.page.getByRole('link', { name: 'My account' }).click();
        await this.page.waitForURL(/\/user/);
    }

    getEditAccountInformationLink() {
        return this.page.getByRole('link', { name: 'Edit account information' });
    }

    async expectEditAccountLinkHasCorrectHref() {
        const link = this.getEditAccountInformationLink();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('target', '_blank');
        // Authelia hosts its account portal at the auth root.
        await expect(link).toHaveAttribute('href', /authentication.*/);
    }

    async clickEditAccountAndGetAccountPage() {
        const link = this.getEditAccountInformationLink();
        const popupPromise = this.page.waitForEvent('popup');
        await link.click();
        const accountPage = await popupPromise;
        await accountPage.waitForLoadState();
        return accountPage;
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
