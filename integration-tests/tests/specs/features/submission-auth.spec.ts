import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';

const unauthenticatedTest = test;

unauthenticatedTest.describe('Submission authentication', () => {
    unauthenticatedTest(
        'prompts user to log in when accessing submission portal',
        async ({ page }) => {
            await page.goto('/');
            await page.getByRole('link', { name: 'Submit' }).click();

            const loginLink = page.getByRole('link', { name: /login or register/i });
            await expect(loginLink).toBeVisible();
            await loginLink.click();

            await expect(page).toHaveURL(/realms\/loculus/i);
        },
    );
});
