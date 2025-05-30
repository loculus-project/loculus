import { expect } from '@playwright/test';
import { test } from '../../fixtures/auth.fixture';
import { GroupPage } from '../../pages/group.page';
import { createTestGroup } from '../../fixtures/group.fixture';

test.describe('Group management', () => {
    test('list groups, create from user page and leave it', async ({ pageWithACreatedUser }) => {
        const groupPage = new GroupPage(pageWithACreatedUser);
        const groupData = createTestGroup();

        await groupPage.navigateToCreateGroupPage();
        await groupPage.createGroup(groupData);

        await groupPage.navigateToUserPage();
        await groupPage.verifyGroupIsPresent(groupData.name);

        await pageWithACreatedUser.getByRole('link', { name: groupData.name }).click();
        await groupPage.leaveGroup();

        await groupPage.verifyGroupIsNotPresent(groupData.name);
    });

    test('edit group details', async ({ pageWithGroup }) => {
        const groupPage = new GroupPage(pageWithGroup);
        const updatedData = createTestGroup();
        updatedData.addressLine2 = 'Suite 101';
        updatedData.state = 'Updated State';

        await groupPage.goToGroupEditPage();
        await groupPage.updateGroup(updatedData);

        await expect(pageWithGroup.getByRole('heading', { name: updatedData.name })).toBeVisible();
        await expect(
            pageWithGroup.getByRole('cell', { name: updatedData.institution }),
        ).toBeVisible();
        await expect(pageWithGroup.getByRole('cell', { name: updatedData.email })).toBeVisible();
        const fullAddress = `${updatedData.addressLine1} ${updatedData.addressLine2}`.trim();
        await expect(pageWithGroup.getByRole('cell', { name: fullAddress })).toBeVisible();
    });

    test('add and remove user from group', async ({ pageWithGroup }) => {
        const groupPage = new GroupPage(pageWithGroup);

        await groupPage.addUserToGroup('testuser');
        await groupPage.removeUserFromGroup('testuser');
        await groupPage.verifyUserIsNotPresent('testuser');
    });
});
