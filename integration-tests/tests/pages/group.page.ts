import { expect, Page } from '@playwright/test';

interface GroupData {
    name: string;
    email: string;
    institution: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state?: string;
    zipCode: string;
    country: string;
}

export class GroupPage {
    constructor(private page: Page) {}

    async navigateToUserPage() {
        await this.page.goto('/');
        await this.page.getByRole('link', { name: 'My account' }).click();
    }

    async navigateToCreateGroupPage() {
        await this.page.goto('/');
        await this.page.getByRole('link', { name: 'My account' }).click();
        await this.page.getByRole('link', { name: 'Create a new submitting group' }).click();
    }

    async verifyGroupIsPresent(groupName: string) {
        const groupEntry = this.page.locator('ul').getByText(groupName);
        await expect(groupEntry).toBeVisible();
    }

    async verifyGroupIsNotPresent(groupName: string) {
        const groupEntry = this.page.locator('ul').getByText(groupName);
        await expect(groupEntry).not.toBeVisible();
    }

    async goToGroupEditPage() {
        const editButton = this.page.getByRole('link', { name: 'Edit group' });
        await editButton.waitFor({ state: 'visible' });
        await editButton.click();
        await this.page.waitForURL(/\/group\/\d+\/edit/);
    }

    async leaveGroup() {
        const leaveButton = this.page.getByRole('button', { name: 'Leave group' });
        await leaveButton.waitFor({ state: 'visible' });
        await leaveButton.click();
        await this.page.getByRole('button', { name: 'Confirm' }).click();
    }

    async addUserToGroup(userName: string) {
        const addButton = this.page.getByRole('button', { name: 'Add user' });
        const inputField = this.page.getByRole('textbox', { name: 'new user name' });
        await inputField.fill(userName);
        await addButton.click();
        await this.verifyUserIsPresent(userName);
    }

    async removeUserFromGroup(userName: string) {
        const removeButton = this.page.getByLabel(`Remove User ${userName}`, { exact: true });
        await removeButton.waitFor({ state: 'visible' });
        await removeButton.click();
        await this.page.getByRole('button', { name: 'Confirm' }).click();
    }

    async verifyUserIsPresent(userName: string) {
        const locator = this.page.locator('ul').getByText(userName, { exact: true });
        await expect(locator).toBeVisible();
    }

    async verifyUserIsNotPresent(userName: string) {
        const locator = this.page.locator('ul').getByText(userName, { exact: true });
        await expect(locator).not.toBeVisible();
    }

    async fillGroupForm(groupData: GroupData) {
        await this.page.getByLabel('Group name', { exact: false }).fill(groupData.name);
        await this.page.getByLabel('Email address', { exact: false }).fill(groupData.email);
        await this.page.getByLabel('Institution', { exact: false }).fill(groupData.institution);
        await this.page.getByLabel('Address Line 1').fill(groupData.addressLine1);
        if (groupData.addressLine2) {
            await this.page.getByLabel('Address Line 2').fill(groupData.addressLine2);
        }
        await this.page.getByLabel('City').fill(groupData.city);
        if (groupData.state) {
            await this.page.getByLabel('State', { exact: false }).fill(groupData.state);
        }
        await this.page.getByLabel('Postal code', { exact: false }).fill(groupData.zipCode);
        await this.page.getByLabel('Country').selectOption(groupData.country);
    }

    async updateGroup(groupData: GroupData) {
        await this.fillGroupForm(groupData);
        await this.page.getByRole('button', { name: 'Update group' }).click();
        await this.page.waitForURL(/\/group\/\d+/);
    }

    async createGroup(groupData: GroupData) {
        await this.navigateToCreateGroupPage();

        await this.page.getByLabel('Group name*').click();
        await this.page.getByLabel('Group name*').fill(groupData.name);
        await this.page.getByLabel('Group name*').press('Tab');

        await this.page.getByLabel('Contact email address*').click();
        await this.page.getByLabel('Contact email address*').fill(groupData.email);

        await this.page.getByLabel('Institution*').click();
        await this.page.getByLabel('Institution*').fill(groupData.institution);

        await this.page.getByLabel('Address Line 1*').click();
        await this.page.getByLabel('Address Line 1*').fill(groupData.addressLine1);

        if (groupData.addressLine2) {
            await this.page.getByLabel('Address Line 2').click();
            await this.page.getByLabel('Address Line 2').fill(groupData.addressLine2);
        }

        await this.page.getByLabel('City*').click();
        await this.page.getByLabel('City*').fill(groupData.city);

        if (groupData.state) {
            await this.page.getByLabel('State / Province').click();
            await this.page.getByLabel('State / Province').fill(groupData.state);
        }

        await this.page.getByLabel('ZIP / Postal code*').click();
        await this.page.getByLabel('ZIP / Postal code*').fill(groupData.zipCode);

        await this.page.getByLabel('Country*').selectOption(groupData.country);

        await this.page.getByRole('button', { name: 'Create group' }).click();

        // Dynamic assertions using the provided groupData
        await expect(this.page.getByRole('cell', { name: groupData.institution })).toBeVisible();
        await expect(this.page.getByRole('cell', { name: groupData.email })).toBeVisible();

        // Combine address lines if addressLine2 exists
        const fullAddress = groupData.addressLine2
            ? `${groupData.addressLine1} ${groupData.addressLine2}`
            : groupData.addressLine1;
        await expect(this.page.getByRole('cell', { name: fullAddress })).toBeVisible();

        await expect(this.page.getByRole('heading', { name: groupData.name })).toBeVisible();
    }
}
