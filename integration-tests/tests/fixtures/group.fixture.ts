import { test as authTest } from './auth.fixture';
import { Page } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';
import { GroupPage } from '../pages/group.page';

type GroupFixtures = {
  pageWithGroup: Page;
  groupName: string;
};

export const test = authTest.extend<GroupFixtures>({
  pageWithGroup: async ({ pageWithACreatedUser }, use) => {
    const groupPage = new GroupPage(pageWithACreatedUser);
    
    const testGroup = {
      name: `test_group_${uuidv4().slice(0, 8)}`,
      email: `test_${uuidv4().slice(0, 8)}@test.com`,
      institution: 'Test Institution',
      addressLine1: '123 Test Street',
      city: 'Test City',
      zipCode: '12345',
      country: 'USA'
    };

    await groupPage.navigateToCreateGroupPage();
    await groupPage.createGroup(testGroup);
    
    await use(pageWithACreatedUser);
  },

  groupName: async ({ pageWithGroup }, use) => {
    const name = `test_group_${uuidv4().slice(0, 8)}`;
    await use(name);
  },
});
