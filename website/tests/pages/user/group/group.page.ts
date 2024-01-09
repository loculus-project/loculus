import type { Page } from '@playwright/test';

import { routes } from '../../../../src/routes.ts';
import { baseUrl, expect } from '../../../e2e.fixture';

export class GroupPage {
    constructor(public readonly page: Page) {}

    public async goToUserPage() {
        await this.page.goto(`${baseUrl}${routes.userOverviewPage()}`, { waitUntil: 'networkidle' });
        await this.page.waitForURL(`${baseUrl}${routes.userOverviewPage()}`);
    }

    public async goToGroupPage(groupName: string) {
        await this.page.goto(`${baseUrl}${routes.groupOverviewPage(groupName)}`, {
            waitUntil: 'networkidle',
        });
        await this.page.waitForURL(`${baseUrl}${routes.groupOverviewPage(groupName)}`);
    }

    public async createGroup(uniqueGroupName: string) {
        const newGroupField = this.page.getByRole('textbox', { name: 'new group name' });
        await newGroupField.fill(uniqueGroupName);
        const createGroupButton = this.page.getByRole('button', { name: 'Create group' });
        await createGroupButton.click();
    }

    public getLocatorForButtonToLeaveGroup(groupName: string) {
        return this.page.locator('li').filter({ hasText: groupName }).getByRole('button');
    }

    public async leaveGroup(uniqueGroupName: string) {
        const buttonToLeaveGroup = this.getLocatorForButtonToLeaveGroup(uniqueGroupName);
        await buttonToLeaveGroup.waitFor({ state: 'visible' });
        await buttonToLeaveGroup.click();

        const confirmButton = this.page.getByRole('button', { name: 'Confirm' });
        await confirmButton.click();
    }

    public async verifyGroupIsPresent(groupName: string) {
        const linkToNewGroup = this.page.getByRole('link', { name: groupName });
        await expect(linkToNewGroup).toBeVisible();

        expect(await linkToNewGroup.getAttribute('href')).toBe(`/group/${groupName}`);

        return linkToNewGroup;
    }

    public getLocatorForButtonToRemoveUser(userName: string) {
        return this.page.getByLabel(`Remove User ${userName}`, { exact: true });
    }

    public async verifyUserIsPresent(userName: string) {
        const userLocator = this.page.locator('ul').getByText(userName, { exact: true });
        await expect(userLocator).toBeVisible();
        return userLocator;
    }

    public async addNewUserToGroup(uniqueUserName: string) {
        const buttonToAddUserToGroup = this.page.getByRole('button', { name: 'Add user' });
        const fieldToAddUserToGroup = this.page.getByRole('textbox', { name: 'new user name' });
        await expect(buttonToAddUserToGroup).toBeVisible();
        await expect(fieldToAddUserToGroup).toBeVisible();
        await fieldToAddUserToGroup.fill(uniqueUserName);

        await buttonToAddUserToGroup.click();

        await this.verifyUserIsPresent(uniqueUserName);
    }

    public async removeUserFromGroup(uniqueUserName: string) {
        const buttonToRemoveUserFromGroup = this.getLocatorForButtonToRemoveUser(uniqueUserName);
        await buttonToRemoveUserFromGroup.waitFor({ state: 'visible' });
        await buttonToRemoveUserFromGroup.click();

        const confirmButton = this.page.getByRole('button', { name: 'Confirm' });
        await confirmButton.click();
    }
}
