import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { GroupPage } from '../../pages/group.page';
import { AuthPage } from '../../pages/auth.page';
import { v4 as uuidv4 } from 'uuid';
import { testScreenshot } from '../../utils/screenshot';

// Tests covering group user management and editing

test.describe('Group management', () => {
    test('can add and remove a user', async ({ pageWithGroup, browser }) => {
        const groupPage = new GroupPage(pageWithGroup);

        const context = await browser.newContext();
        const newPage = await context.newPage();
        const authPage = new AuthPage(newPage);
        const newAccount = {
            username: `user_${uuidv4().slice(0, 8)}`,
            password: 'password',
            email: `test_${uuidv4().slice(0, 8)}@test.com`,
            firstName: 'Test',
            lastName: 'User',
            organization: 'Test Org',
        };
        await authPage.createAccount(newAccount);
        await context.close();

        await groupPage.addNewUserToGroup(newAccount.username);
        await groupPage.verifyUserIsPresent(newAccount.username);
        await testScreenshot(pageWithGroup, 'group-with-user.png');

        await groupPage.removeUserFromGroup(newAccount.username);
        await groupPage.verifyUserIsNotPresent(newAccount.username);
    });

    test('can edit group information', async ({ pageWithGroup }) => {
        const groupPage = new GroupPage(pageWithGroup);

        const newName = `group_${uuidv4().slice(0, 8)}`;
        const newInstitution = 'New Institution';
        const newEmail = `contact_${uuidv4().slice(0, 8)}@test.com`;
        const newLine1 = '456 New Street';
        const newCity = 'New City';
        const newState = 'CA';
        const newPostalCode = '99999';

        await groupPage.goToGroupEditPage();
        await groupPage.editGroupName(newName);
        await groupPage.editInstitution(newInstitution);
        await groupPage.editContactEmail(newEmail);
        await groupPage.editAddressLine1(newLine1);
        await groupPage.editCity(newCity);
        await groupPage.editState(newState);
        await groupPage.editPostalCode(newPostalCode);
        await groupPage.finishEditingGroup();

        await expect(pageWithGroup.getByRole('heading', { name: newName })).toBeVisible();
        const table = pageWithGroup.locator('table').filter({ hasText: 'Group ID' });
        await expect(table).toContainText(newInstitution);
        await expect(table).toContainText(newEmail);
        await expect(table).toContainText(newLine1);
        await expect(table).toContainText(newCity);
        await expect(table).toContainText(newState);
        await expect(table).toContainText(newPostalCode);
        await testScreenshot(pageWithGroup, 'group-edited.png');
    });
});
