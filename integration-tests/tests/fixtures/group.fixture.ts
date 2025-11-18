import { test as authTest } from './auth.fixture';
import { Page } from '@playwright/test';
import { GroupPage } from '../pages/group.page';
import { buildTestGroup } from '../utils/testGroup';

type GroupFixtures = {
    pageWithGroup: Page;
    groupName: string;
    groupId: number;
};

export const test = authTest.extend<GroupFixtures>({
    groupName: async ({}, use) => {
        await use(buildTestGroup().name);
    },

    groupId: async ({ pageWithACreatedUser, groupName }, use) => {
        const groupPage = new GroupPage(pageWithACreatedUser);
        const testGroup = buildTestGroup(groupName);

        const groupId = await groupPage.createGroup(testGroup);
        await use(groupId);
    },

    pageWithGroup: async ({ pageWithACreatedUser, groupId }, use) => {
        // Ensure group is created by depending on groupId
        void groupId;
        await use(pageWithACreatedUser);
    },
});
