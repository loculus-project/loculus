import { v4 } from 'uuid';

import { expect, test } from '../../../e2e.fixture';
import { DEFAULT_GROUP_NAME } from '../../../playwrightSetup.ts';

test.describe('The group page', () => {
    test('should see all users of the group, add a user and remove it afterwards', async ({
        groupPage,
        loginAsTestUser,
    }) => {
        const { username } = await loginAsTestUser();

        await groupPage.goToGroupPage(DEFAULT_GROUP_NAME);

        await groupPage.verifyUserIsPresent(username);

        const uniqueUserName = v4();
        await groupPage.addNewUserToGroup(uniqueUserName);

        await groupPage.verifyUserIsPresent(uniqueUserName);

        await groupPage.removeUserFromGroup(uniqueUserName);

        await expect(groupPage.getLocatorForButtonToRemoveUser(uniqueUserName)).not.toBeVisible();
    });
});
