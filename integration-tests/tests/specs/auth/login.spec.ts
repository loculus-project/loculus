import { expect } from '@playwright/test';
import { test } from '../../fixtures/auth.fixture';
import { AuthPage } from '../../pages/auth.page';

test.describe('Login Flow', () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
  });

  test('should login with valid credentials', async ({ page, testAccount }) => {
    await authPage.createAccount(testAccount);
    await page.waitForTimeout(1000);
    await authPage.logout();
    await page.waitForTimeout(1000);
    await authPage.login(testAccount.username, testAccount.password);
    
  });
});
