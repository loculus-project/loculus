import { test as setup } from '@playwright/test';

/*
 * Keycloak gzips theme resources into a cache on first request, and concurrent first requests
 * for the same resource race and can return 404. Loading the login and register pages once,
 * before parallel tests start, fills that cache. This uses the plain Playwright test (not the
 * console-warnings fixture) so that a 404 hit during warm-up does not fail it.
 */
setup('Warm up Keycloak theme resource cache', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Login' }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: 'Register' }).click();
    await page.waitForLoadState('networkidle');
});
