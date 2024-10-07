import { v4 } from 'uuid';

import { test, testUser } from '../../../e2e.fixture';

test.describe('The group page', () => {
    test('should see all users of the group, add a user and remove it afterwards', async ({
        groupPage,
        loginAsTestUser,
    }) => {
        const { username } = await loginAsTestUser();

        await groupPage.goToUserPage();
        await groupPage.goToGroupCreationPage();

        const uniqueGroupName = v4();
        await groupPage.createGroup(uniqueGroupName);

        await groupPage.verifyUserIsPresent(username);

        await groupPage.addNewUserToGroup(testUser);

        await groupPage.verifyUserIsPresent(testUser);

        await groupPage.removeUserFromGroup(testUser);

        await groupPage.verifyUserIsNotPresent(testUser);

        // TODO: Edit a group and verify the changes are shown
    });
});
