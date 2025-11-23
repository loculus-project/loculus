import { test as authTest } from './auth.fixture';
import { GroupPage } from '../pages/group.page';
import { buildTestGroup } from '../utils/testGroup';

type GroupFixtures = {
    groupName: string;
    groupId: number;
};

export const test = authTest.extend<GroupFixtures>({
    groupName: async ({}, use) => {
        await use(buildTestGroup().name);
    },

    groupId: async ({ page, authenticatedUser, groupName }, use) => {
        // Ensure user is authenticated by depending on authenticatedUser
        void authenticatedUser;

        const groupPage = new GroupPage(page);
        const testGroup = buildTestGroup(groupName);

        const groupId = await groupPage.createGroup(testGroup);
        await use(groupId);
    },
});
