import { v4 } from 'uuid';

import { test } from '../../e2e.fixture';

test.describe('The user page', () => {
    test('should see the groups the user is member of, create a group and leave it afterwards', async ({
        groupPage,
        userPage,
        loginAsTestUser,
    }) => {
        const { groupName } = await loginAsTestUser();

        await groupPage.goToUserPage();
        await groupPage.verifyGroupIsPresent(groupName);

        await groupPage.goToGroupCreationPage();
        const uniqueGroupName = v4();
        await groupPage.createGroup(uniqueGroupName);
        await groupPage.verifyGroupIsPresent(uniqueGroupName);

        await userPage.goToUserPage();
        await userPage.leaveGroup(uniqueGroupName);

        await userPage.verifyGroupIsNotPresent(uniqueGroupName);
    });
});
