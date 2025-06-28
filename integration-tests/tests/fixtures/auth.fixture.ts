import { test as base, expect, Page, ConsoleMessage } from '@playwright/test';

import { v4 as uuidv4 } from 'uuid';
import { AuthPage } from '../pages/auth.page';
import { TestAccount } from '../types/auth.types';

type TestFixtures = {
    pageWithACreatedUser: Page;
    testAccount: TestAccount;
    consoleWarnings: string[];
};

export const test = base.extend<TestFixtures>({
    testAccount: async ({}, use) => {
        const testAccount: TestAccount = {
            username: `test_user_${uuidv4().slice(0, 8)}`,
            password: 'password',
            email: `test_${uuidv4().slice(0, 8)}@test.com`,
            firstName: 'Test',
            lastName: 'User',
            organization: 'Test University',
        };
        await use(testAccount);
    },

pageWithACreatedUser: [
        async ({ page, testAccount }, use) => {
            const authPage = new AuthPage(page);
            await authPage.createAccount(testAccount);
            try {
                await use(page);
            } finally {
                await authPage.logout();
            }
        },
        { timeout: 30_000 }],

    consoleWarnings: [
        async ({ page }, use) => {
            const warnings: string[] = [];
            const handleConsole = (msg: ConsoleMessage) => {
                if (msg.type() === 'warning') {
                    warnings.push(msg.text());
                }
            };
            page.on('console', handleConsole);
            await use(warnings);
            page.off('console', handleConsole);
            expect(warnings).toEqual([]);
        },
        { auto: true },

    ],
});
