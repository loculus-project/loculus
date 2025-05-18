import type { Page } from '@playwright/test';

import { routes } from '../../../../src/routes/routes.ts';
import { baseUrl, DEFAULT_GROUP, expect } from '../../../e2e.fixture';

export class GroupPage {
    constructor(public readonly page: Page) {}

    public async goToUserPage() {
        await this.page.goto(`${baseUrl}${routes.userOverviewPage()}`, { waitUntil: 'load' });
        await this.page.waitForURL(`${baseUrl}${routes.userOverviewPage()}`);
    }

    public async goToGroupCreationPage() {
        const linkToNewGroup = this.page.getByRole('link', { name: 'Create a new submitting group', exact: false });
        await linkToNewGroup.click();
    }

    public async goToGroupPage(groupId: number) {
        await this.page.goto(`${baseUrl}${routes.groupOverviewPage(groupId)}`);
        await this.page.waitForURL(`${baseUrl}${routes.groupOverviewPage(groupId)}`);
    }

    public async goToGroupEditPage() {
        const editButton = this.page.getByRole('link', { name: 'Edit group' });
        await editButton.waitFor({ state: 'visible' });
        await editButton.click();
        await this.page.waitForURL(/\/group\/\d+\/edit/);
    }

    public async editGroupName(groupName: string) {
        const newGroupField = this.page.getByLabel('Group name');
        await newGroupField.fill(groupName);
    }

    public async editInstitution(institution: string) {
        const newInstitutionField = this.page.getByLabel('Institution');
        await newInstitutionField.fill(institution);
    }

    public async editContactEmail(contactEmail: string) {
        const newContactEmailField = this.page.getByLabel('Email address', { exact: false });
        await newContactEmailField.fill(contactEmail);
    }

    public async editCountry(index: number) {
        const newCountryField = this.page.getByLabel('Country');
        await newCountryField.selectOption({ index });
    }

    public async editAddressLine1(line1: string) {
        const newLine1Field = this.page.getByLabel('Address Line 1');
        await newLine1Field.fill(line1);
    }

    public async editAddressLine2(line2: string) {
        const newLine2Field = this.page.getByLabel('Address Line 2');
        await newLine2Field.fill(line2);
    }

    public async editCity(city: string) {
        const newCityField = this.page.getByLabel('City');
        await newCityField.fill(city);
    }

    public async editState(state: string) {
        const newStateField = this.page.getByLabel('State', { exact: false });
        await newStateField.fill(state);
    }

    public async editPostalCode(postalCode: string) {
        const newPostalCodeField = this.page.getByLabel('Postal code', { exact: false });
        await newPostalCodeField.fill(postalCode);
    }

    public async finishEditingGroup() {
        const updateGroupButton = this.page.getByRole('button', { name: 'Update group' });
        await updateGroupButton.click();

        await this.page.waitForURL(/\/group\/\d+/);
    }

    public async createGroup(uniqueGroupName: string) {
        await this.editGroupName(uniqueGroupName);
        await this.editInstitution(DEFAULT_GROUP.institution);
        await this.editContactEmail(DEFAULT_GROUP.contactEmail);
        await this.editCountry(1);
        await this.editAddressLine1(DEFAULT_GROUP.address.line1);
        await this.editAddressLine2(DEFAULT_GROUP.address.line2 ?? '');
        await this.editCity(DEFAULT_GROUP.address.city);
        await this.editState(DEFAULT_GROUP.address.state ?? '');
        await this.editPostalCode(DEFAULT_GROUP.address.postalCode);

        const createGroupButton = this.page.getByRole('button', { name: 'Create group' });
        await createGroupButton.click();

        await this.page.waitForURL(/\/group\/\d+/);
        return Number(this.page.url().split('/').pop());
    }

    public async verifyGroupIsPresent(groupName: string) {
        const newGroupEntry = this.page.locator('ul').getByText(groupName);
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
        await expect(fieldToAddUserToGroup).toHaveValue(uniqueUserName);

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

    public async leaveGroup() {
        const leaveButton = this.page.getByRole('button', { name: 'Leave group' });
        await leaveButton.waitFor({ state: 'visible' });
        await leaveButton.click();

        const confirmButton = this.page.getByRole('button', { name: 'Confirm' });
        await confirmButton.click();
    }
}
