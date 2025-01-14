import { test as base, Page } from '@playwright/test';

import { v4 as uuidv4 } from 'uuid';
import { AuthPage } from '../pages/auth.page';
import { TestAccount } from '../types/auth.types';

type TestFixtures = {
  pageWithACreatedUser: Page;
  testAccount: TestAccount;
};

export const test = base.extend<TestFixtures>({
  testAccount: async ({}, use) => {
    const testAccount : TestAccount = {
      username: `test_user_${uuidv4().slice(0, 8)}`,
      password: 'password',
      email: `test_${uuidv4().slice(0, 8)}@test.com`,
      firstName: 'Test',
      lastName: 'User',
      organization: 'Test University'
    };
    await use(testAccount);
  },
  
  pageWithACreatedUser: async ({ page, testAccount }, use) => {
    const authPage = new AuthPage(page);
    await authPage.createAccount(testAccount);
    await use(page);
    await authPage.logout();
  },
});