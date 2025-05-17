import { expect } from '@playwright/test';
import { test } from '../../fixtures/auth.fixture';
import { AuthPage } from '../../pages/auth.page';

test.describe('Logout Flow', () => {
    let authPage: AuthPage;

    test.beforeEach(async ({ page }) => {
        authPage = new AuthPage(page);
    });

    test('should logout a logged in user', async ({ page, testAccount }) => {
        await authPage.createAccount(testAccount);
        await authPage.logout();

        await expect(page).toHaveURL('/logout');
        await expect(page.context().cookies()).resolves.toEqual([]);
    });
});
