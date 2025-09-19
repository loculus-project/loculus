import { expect } from '@playwright/test';

import { test } from '../../fixtures/auth.fixture';
import { AuthPage } from '../../pages/auth.page';

const AUTH_COOKIE_NAMES = ['access_token', 'refresh_token'];

test.describe('Logout Flow', () => {
    let authPage: AuthPage;

    test.beforeEach(({ page }) => {
        authPage = new AuthPage(page);
    });

    test('should logout from the account menu', async ({ page, testAccount }) => {
        await authPage.createAccount(testAccount);
        await page.waitForLoadState('networkidle');

        await authPage.logout();

        await expect(page).toHaveURL(/\/logout$/);
        await expect(page.getByText('You have been logged out')).toBeVisible();

        const cookies = await page.context().cookies();
        const authCookies = cookies.filter((cookie) => AUTH_COOKIE_NAMES.includes(cookie.name));

        expect(authCookies).toHaveLength(0);
    });
});
