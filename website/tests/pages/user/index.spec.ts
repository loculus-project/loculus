import { v4 } from 'uuid';

import { expect, test } from '../../e2e.fixture';

test.describe('The user page', () => {
    test('should see the groups the user is member of, create a group and leave it afterwards', async ({
        groupPage,
        loginAsTestUser,
    }) => {
        const { groupName } = await loginAsTestUser();

        await groupPage.goToUserPage();
        await groupPage.verifyGroupIsPresent(groupName);

        const uniqueGroupName = v4();
        await groupPage.createGroup(uniqueGroupName);
        const linkToNewGroup = await groupPage.verifyGroupIsPresent(uniqueGroupName);

        await groupPage.leaveGroup(uniqueGroupName);
        await expect(linkToNewGroup).not.toBeVisible();
    });
});
