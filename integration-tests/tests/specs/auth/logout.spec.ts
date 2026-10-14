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

        await page.goto('/user?source=account-page');
        await page.getByRole('link', { name: 'Logout' }).click();
        await page.getByRole('button', { name: 'Logout' }).click();

        await expect(page).toHaveURL(/\/logout$/);
        await expect(page.getByText('You have been logged out')).toBeVisible();

        const cookies = await page.context().cookies();
        const authCookies = cookies.filter((cookie) => AUTH_COOKIE_NAMES.includes(cookie.name));

        expect(authCookies).toHaveLength(0);

        await expect(page.getByText(/Redirecting to the homepage in/)).toBeVisible();
        await expect(page.getByRole('link', { name: 'Go to homepage' })).toHaveAttribute(
            'href',
            '/',
        );
        await expect(page).toHaveURL(new URL('/', page.url()).toString(), { timeout: 15_000 });
        await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    });

    test.describe('without JavaScript', () => {
        test.use({ javaScriptEnabled: false });

        test('provides a working homepage link without a countdown', async ({ page }) => {
            await page.goto('/logout');
            await expect(page.getByText('You have been logged out')).toBeVisible();
            await expect(page.getByText(/Redirecting to the homepage in/)).toBeHidden();
            await page.getByRole('link', { name: 'Go to homepage' }).click();
            await expect(page).toHaveURL(new URL('/', page.url()).toString());
        });
    });
});
