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

const createTestGroup = (name = `test_group_${uuidv4().slice(0, 8)}`): TestGroup => ({
  name,
  email: `test_${uuidv4().slice(0, 8)}@test.com`,
  institution: 'Test Institution',
  addressLine1: '123 Test Street',
  city: 'Test City',
  zipCode: '12345',
  country: 'USA'
});

type GroupFixtures = {
  pageWithGroup: Page;
  groupName: string;
};

export const test = authTest.extend<GroupFixtures>({
  groupName: async ({}, use) => {
    await use(createTestGroup().name);
  },

  pageWithGroup: async ({ pageWithACreatedUser, groupName }, use) => {
    const groupPage = new GroupPage(pageWithACreatedUser);
    const testGroup = createTestGroup(groupName);
    
    await groupPage.navigateToCreateGroupPage();
    await groupPage.createGroup(testGroup);
    
    await use(pageWithACreatedUser);
  },
});