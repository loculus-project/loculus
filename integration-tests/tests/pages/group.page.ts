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

    async navigateToCreateGroupPage() {
        await this.page.goto('/');
        await this.page.getByRole('link', { name: 'My account' }).click();
        await this.page.getByRole('link', { name: 'Create a new submitting group' }).click();
    }

    async createGroup(groupData: GroupData): Promise<number> {
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

        // Extract and return the group ID from the URL
        const url = this.page.url();
        const groupId = url.split('/').pop();

        if (!groupId) {
            throw new Error(`Could not determine group ID for group: ${groupData.name}`);
        }

        return parseInt(groupId);
    }

    async getOrCreateGroup(groupData: GroupData): Promise<number> {
        await this.page.goto('/');
        await this.page.getByRole('link', { name: 'My account' }).click();
        const groupLink = this.page
            .locator('li')
            .filter({ hasText: groupData.name })
            .getByRole('link')
            .first();

        let groupId: number | null | undefined;

        if (await groupLink.isVisible()) {
            const href = await groupLink.getAttribute('href');
            const groupIdStr = href?.split('/').pop();
            groupId = groupIdStr ? parseInt(groupIdStr) : null;
        } else {
            groupId = await this.createGroup(groupData);
        }

        if (!groupId) {
            throw new Error(`Could not determine group ID for group: ${groupData.name}`);
        }
        return groupId;
    }

    async goToGroupEditPage() {
        const editButton = this.page.getByRole('link', { name: 'Edit group' });
        await editButton.waitFor({ state: 'visible' });
        await editButton.click();
        await this.page.waitForURL(/\/group\/\d+\/edit/);
    }

    async editGroupName(name: string) {
        await this.page.getByLabel('Group name').fill(name);
    }

    async editInstitution(institution: string) {
        await this.page.getByLabel('Institution').fill(institution);
    }

    async editContactEmail(email: string) {
        await this.page.getByLabel('Email address', { exact: false }).fill(email);
    }

    async editAddressLine1(line1: string) {
        await this.page.getByLabel('Address Line 1').fill(line1);
    }

    async editAddressLine2(line2: string) {
        await this.page.getByLabel('Address Line 2').fill(line2);
    }

    async editCity(city: string) {
        await this.page.getByLabel('City').fill(city);
    }

    async editState(state: string) {
        await this.page.getByLabel('State', { exact: false }).fill(state);
    }

    async editPostalCode(code: string) {
        await this.page.getByLabel('Postal code', { exact: false }).fill(code);
    }

    async finishEditingGroup() {
        await this.page.getByRole('button', { name: 'Update group' }).click();
        await this.page.waitForURL(/\/group\/\d+/);
    }

    async verifyUserIsPresent(username: string) {
        await expect(this.page.locator('ul').getByText(username, { exact: true })).toBeVisible();
    }

    async verifyUserIsNotPresent(username: string) {
        await expect(this.page.locator('ul').getByText(username, { exact: true })).toBeHidden();
    }

    async addNewUserToGroup(username: string) {
        const button = this.page.getByRole('button', { name: 'Add user' });
        const field = this.page.getByRole('textbox', { name: 'new user name' });
        await field.fill(username);
        await button.click();
        await this.verifyUserIsPresent(username);
    }

    async removeUserFromGroup(username: string) {
        const button = this.page.getByLabel(`Remove User ${username}`, { exact: true });
        await button.waitFor({ state: 'visible' });
        await button.click();
        await this.page.getByRole('button', { name: 'Confirm' }).click();
    }

    async leaveGroup() {
        const leaveButton = this.page.getByRole('button', { name: 'Leave group' });
        await leaveButton.waitFor({ state: 'visible' });
        await leaveButton.click();

        const confirmButton = this.page.getByRole('button', { name: 'Confirm' });
        await confirmButton.waitFor({ state: 'visible' });
        await confirmButton.click();
        await this.page.waitForURL(/\/user/);
    }
}
