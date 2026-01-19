import { test as base } from './console-warnings.fixture';

import { randomUUID } from 'crypto';
import { AuthPage } from '../pages/auth.page';
import { TestAccount } from '../types/auth.types';

type TestFixtures = {
    authenticatedUser: TestAccount;
    testAccount: TestAccount;
};

export const test = base.extend<TestFixtures>({
    testAccount: async ({}, use) => {
        const testAccount: TestAccount = {
            username: `test_user_${randomUUID().slice(0, 8)}`,
            password: 'password',
            email: `test_${randomUUID().slice(0, 8)}@test.com`,
            firstName: 'Test',
            lastName: 'User',
            organization: 'Test University',
        };
        await use(testAccount);
    },

    authenticatedUser: async ({ page, testAccount }, use) => {
        const authPage = new AuthPage(page);
        await authPage.createAccount(testAccount);
        await use(testAccount);
    },
});
