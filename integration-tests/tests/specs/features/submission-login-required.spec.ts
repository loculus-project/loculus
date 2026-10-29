import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';

test.describe('Submission page login requirements', () => {
    test('should ask to login if not logged in', async ({ page }) => {
        // Not via the organism menu: it leads to the search page, which requires a login with
        // auth.requireAuthenticationForData
        await page.goto('/ebola-sudan/submission');

        const loginLink = page.getByRole('link', { name: 'Login or register' });
        await expect(loginLink).toBeVisible();

        await loginLink.click();
        await expect(page).toHaveURL(/realms\/loculus/);
    });
});
