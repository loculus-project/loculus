import { expect } from '@playwright/test';
import { test } from '../../fixtures/auth.fixture';
import { AuthPage } from '../../pages/auth.page';

test.describe('Registration Flow', () => {
    let authPage: AuthPage;

    test.beforeEach(({ page }) => {
        authPage = new AuthPage(page);
    });

    test('should successfully register a new user', async ({ testAccount, page }) => {
        await authPage.createAccount(testAccount);
        await expect(page).toHaveScreenshot('registered-user.png');
    });
});
