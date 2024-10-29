import { test as base, Page } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';
import { AuthPage } from '../pages/auth.page';
import { TestAccount } from '../types/auth.types';

type TestFixtures = {
  authenticatedPage: Page;
  testAccount: TestAccount;
};

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    const authPage = new AuthPage(page);
    
    const testAccount = {
      username: `test_user_${uuidv4().slice(0, 8)}`,
      password: 'password',
      email: `test_${uuidv4().slice(0, 8)}@test.com`,
      firstName: 'Test',
      lastName: 'User',
      organization: 'Test University'
    };

    await authPage.createAccount(testAccount);
    await use(page);
    await authPage.logout();
  },

  testAccount: async ({}, use) => {
    const testAccount = {
      username: `test_user_${uuidv4().slice(0, 8)}`,
      password: 'password',
      email: `test_${uuidv4().slice(0, 8)}@test.com`,
      firstName: 'Test',
      lastName: 'User',
      organization: 'Test University'
    };
    await use(testAccount);
  },
});
