import { v4 } from 'uuid';

import { test } from '../../e2e.fixture';

test.describe('The user page', () => {
    test('should see the groups the user is member of, create a submitting group and leave it afterwards', async ({
        groupPage,
        userPage,
        loginAsTestUser,
    }) => {
        const { groupName } = await loginAsTestUser();

        await groupPage.goToUserPage();
        await groupPage.verifyGroupIsPresent(groupName);

        await groupPage.goToGroupCreationPage();
        const uniqueGroupName = v4();
        const groupId = await groupPage.createGroup(uniqueGroupName);
        await userPage.goToUserPage();
        await groupPage.verifyGroupIsPresent(uniqueGroupName);

        await groupPage.goToGroupPage(groupId);
        await groupPage.leaveGroup();

        await userPage.verifyGroupIsNotPresent(uniqueGroupName);
    });
});
