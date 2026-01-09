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
        await expect(link).toHaveAttribute('href', /\/realms\/loculus\/account$/);
    }

    async clickEditAccountAndGetKeycloakPage() {
        const link = this.getEditAccountInformationLink();
        const popupPromise = this.page.waitForEvent('popup');
        await link.click();
        const keycloakPage = await popupPromise;
        await keycloakPage.waitForLoadState();
        return keycloakPage;
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
