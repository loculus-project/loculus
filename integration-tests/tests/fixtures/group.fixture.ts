import { test as authTest } from './auth.fixture';
import { Page } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';
import { GroupPage } from '../pages/group.page';

interface TestGroup {
    name: string;
    email: string;
    institution: string;
    addressLine1: string;
    city: string;
    zipCode: string;
    country: string;
}

export const readonlyGroup = {
    name: 'readonly-group',
    email: 'readonly-group@example.com',
    institution: 'Readonly Institute',
    addressLine1: '123 Readonly Street',
    city: 'Readonly City',
    zipCode: '12345',
    country: 'USA',
};

export const createTestGroup = (name = `test_group_${uuidv4().slice(0, 8)}`): TestGroup => ({
    name,
    email: `test_${uuidv4().slice(0, 8)}@test.com`,
    institution: 'Test Institution',
    addressLine1: '123 Test Street',
    city: 'Test City',
    zipCode: '12345',
    country: 'USA',
});

type GroupFixtures = {
    pageWithGroup: Page;
    groupName: string;
    groupId: number;
};

export const test = authTest.extend<GroupFixtures>({
    groupName: async ({}, use) => {
        await use(createTestGroup().name);
    },

    groupId: async ({ pageWithACreatedUser, groupName }, use) => {
        const groupPage = new GroupPage(pageWithACreatedUser);
        const testGroup = createTestGroup(groupName);

        const groupId = await groupPage.getOrCreateGroup(testGroup);
        await use(groupId);
    },

    pageWithGroup: async ({ pageWithACreatedUser, groupId }, use) => {
        // Ensure group is created by depending on groupId
        void groupId;
        await use(pageWithACreatedUser);
    },
});
