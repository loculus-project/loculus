import { expect, test } from '@playwright/test';

// Use base test (not console-warnings fixture) because 404 pages produce expected console errors
test.describe('Error pages', () => {
    test('should display 404 page for non-existent routes', async ({ page }) => {
        const response = await page.goto('/this-page-does-not-exist');

        expect(response?.status()).toBe(404);
        await expect(page.getByText('Page not found')).toBeVisible();
        await expect(page.getByText('The page you are looking for does not exist.')).toBeVisible();
    });

    test('should display error for non-existent sequence accession', async ({ page }) => {
        await page.goto('/seq/LOC_NONEXISTENT.1');

        // The page may render with 200 but show an error message
        await expect(
            page
                .getByText(/not found/i)
                .or(page.getByText(/does not exist/i))
                .or(page.getByText(/error/i))
                .first(),
        ).toBeVisible();
    });
});
