import { expect } from '@playwright/test';
import { test } from '../../fixtures/auth.fixture';
import { AuthPage } from '../../pages/auth.page';

// Verify error message appears when logging in with invalid credentials

test.describe('Login Failure', () => {
    let authPage: AuthPage;

    test.beforeEach(async ({ page }) => {
        authPage = new AuthPage(page);
    });

    test('should display an error for invalid password', async ({ page, testAccount }) => {
        await authPage.createAccount(testAccount);
        await authPage.logout();
        await authPage.loginExpectFailure(testAccount.username, 'wrong-password');
    });
});
