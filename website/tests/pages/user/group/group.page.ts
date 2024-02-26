import type { Page } from '@playwright/test';

import { routes } from '../../../../src/routes.ts';
import { baseUrl, DEFAULT_GROUP, expect } from '../../../e2e.fixture';

export class GroupPage {
    constructor(public readonly page: Page) {}

    public async goToUserPage() {
        await this.page.goto(`${baseUrl}${routes.userOverviewPage()}`, { waitUntil: 'networkidle' });
        await this.page.waitForURL(`${baseUrl}${routes.userOverviewPage()}`);
    }

    public async goToGroupCreationPage() {
        const linkToNewGroup = this.page.getByRole('link', { name: 'Create a new Group', exact: true });
        await linkToNewGroup.click();
    }

    public async goToGroupPage(groupName: string) {
        await this.page.goto(`${baseUrl}${routes.groupOverviewPage(groupName)}`, {
            waitUntil: 'networkidle',
        });
        await this.page.waitForURL(`${baseUrl}${routes.groupOverviewPage(groupName)}`);
    }

    public async createGroup(uniqueGroupName: string) {
        const newGroupField = this.page.getByLabel('Group name');
        await newGroupField.fill(uniqueGroupName);

        const newInstitutionField = this.page.getByLabel('Institution');
        await newInstitutionField.fill(DEFAULT_GROUP.institution);

        const newContactEmailField = this.page.getByLabel('Email address', { exact: false });
        await newContactEmailField.fill(DEFAULT_GROUP.contactEmail);

        const newCountryField = this.page.getByLabel('Country');
        await newCountryField.selectOption({ index: 1 });

        const newLine1Field = this.page.getByLabel('Address Line 1');
        await newLine1Field.fill(DEFAULT_GROUP.address.line1);

        const newLine2Field = this.page.getByLabel('Address Line 2');
        await newLine2Field.fill(DEFAULT_GROUP.address.line2 ?? '');

        const newCityField = this.page.getByLabel('City');
        await newCityField.fill(DEFAULT_GROUP.address.city);

        const newStateField = this.page.getByLabel('State', { exact: false });
        await newStateField.fill(DEFAULT_GROUP.address.state ?? '');

        const newPostalCodeField = this.page.getByLabel('Postal code', { exact: false });
        await newPostalCodeField.fill(DEFAULT_GROUP.address.postalCode);

        const createGroupButton = this.page.getByRole('button', { name: 'Create group' });
        await createGroupButton.click();
    }

    public getLocatorForButtonToLeaveGroup(groupName: string) {
        return this.page.locator('li').filter({ hasText: groupName }).getByRole('button');
    }

    public async verifyGroupIsPresent(groupName: string) {
        const newGroupEntry = this.page.getByText(groupName);
        await expect(newGroupEntry).toBeVisible();
    }

    public getLocatorForButtonToRemoveUser(userName: string) {
        return this.page.getByLabel(`Remove User ${userName}`, { exact: true });
    }

    public async verifyUserIsPresent(userName: string) {
        const userLocator = this.page.locator('ul').getByText(userName, { exact: true });
        await expect(userLocator).toBeVisible();
        return userLocator;
    }

    public async verifyUserIsNotPresent(userName: string) {
        const userLocator = this.page.locator('ul').getByText(userName, { exact: true });
        await expect(userLocator).not.toBeVisible();
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
