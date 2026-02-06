import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { GroupPage } from '../../pages/group.page';
import { AuthPage } from '../../pages/auth.page';
import { randomUUID } from 'crypto';

// Tests covering group user management and editing

test.describe('Group management', () => {
    test('can add and remove a user', async ({ page, groupId, browser }) => {
        void groupId;
        const groupPage = new GroupPage(page);

        const context = await browser.newContext();
        const newPage = await context.newPage();
        const authPage = new AuthPage(newPage);
        const newAccount = {
            username: `user_${randomUUID().slice(0, 8)}`,
            password: 'password',
            email: `test_${randomUUID().slice(0, 8)}@test.com`,
            firstName: 'Test',
            lastName: 'User',
            organization: 'Test Org',
        };
        await authPage.createAccount(newAccount);
        await context.close();

        await groupPage.addNewUserToGroup(newAccount.username);
        await groupPage.verifyUserIsPresent(newAccount.username);

        await groupPage.removeUserFromGroup(newAccount.username);
        await groupPage.verifyUserIsNotPresent(newAccount.username);
    });

    test('can edit group information', async ({ page, groupId }) => {
        void groupId;
        const groupPage = new GroupPage(page);

        const newName = `group_${randomUUID().slice(0, 8)}`;
        const newInstitution = 'New Institution';
        const newEmail = `contact_${randomUUID().slice(0, 8)}@test.com`;
        const newLine1 = '456 New Street';
        const newLine2 = 'Suite 100';
        const newCity = 'New City';
        const newState = 'CA';
        const newPostalCode = '99999';

        await groupPage.goToGroupEditPage();
        await groupPage.editGroupName(newName);
        await groupPage.editInstitution(newInstitution);
        await groupPage.editContactEmail(newEmail);
        await groupPage.editAddressLine1(newLine1);
        await groupPage.editAddressLine2(newLine2);
        await groupPage.editCity(newCity);
        await groupPage.editState(newState);
        await groupPage.editPostalCode(newPostalCode);
        await groupPage.finishEditingGroup();

        await expect(page.getByRole('heading', { name: newName })).toBeVisible();
        // Select the group details table, ignoring the sequence counts table
        const table = page.locator('table').filter({ hasText: 'Group ID' });
        await expect(table).toContainText(newInstitution);
        await expect(table).toContainText(newEmail);
        await expect(table).toContainText(newLine1);
        await expect(table).toContainText(newLine2);
        await expect(table).toContainText(newCity);
        await expect(table).toContainText(newState);
        await expect(table).toContainText(newPostalCode);
    });
});
