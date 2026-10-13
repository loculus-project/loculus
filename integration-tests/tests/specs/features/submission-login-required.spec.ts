import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';

test.describe('Submission page login requirements', () => {
    test('should ask to login if not logged in', async ({ page }) => {
        // Navigate directly to the submission page: the homepage is gated behind a login
        // when LAPIS authentication is enabled, but submission pages stay reachable for
        // anonymous visitors (they show a login prompt instead).
        await page.goto('/ebola-sudan/submission');

        const loginLink = page.getByRole('link', { name: 'Login or register' });
        await expect(loginLink).toBeVisible();

        await loginLink.click();
        await expect(page).toHaveURL(/realms\/loculus/);
    });
});
