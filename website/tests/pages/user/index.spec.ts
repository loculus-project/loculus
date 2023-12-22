import { v4 } from 'uuid';

import { expect, test } from '../../e2e.fixture';
import { DEFAULT_GROUP_NAME } from '../../playwrightSetup.ts';

test.describe('The user page', () => {
    test('should see the groups the user is member of, create a group and leave it afterwards', async ({
        groupPage,
        loginAsTestUser,
    }) => {
        await loginAsTestUser();

        await groupPage.goToUserPage();
        await groupPage.verifyGroupIsPresent(DEFAULT_GROUP_NAME);

        const uniqueGroupName = v4();
        await groupPage.createGroup(uniqueGroupName);
        const linkToNewGroup = await groupPage.verifyGroupIsPresent(uniqueGroupName);

        await groupPage.leaveGroup(uniqueGroupName);
        await expect(linkToNewGroup).not.toBeVisible();
    });
});
