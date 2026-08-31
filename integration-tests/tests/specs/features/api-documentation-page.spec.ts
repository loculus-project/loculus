import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';

test.describe('API documentation page', () => {
    test('should display API documentation with correct sections and links', async ({ page }) => {
        await page.goto('/api-documentation');

        await expect(page).toHaveTitle(/API documentation/);
        await expect(page.getByRole('heading', { name: 'API documentation' })).toBeVisible();

        await expect(page.getByRole('link', { name: 'Swagger UI' })).toBeVisible();
        await expect(
            page.getByRole('link', { name: 'API Authentication documentation' }),
        ).toBeVisible();
        await expect(page.getByRole('link', { name: 'Data use terms' })).toBeVisible();

        await expect(page.getByRole('heading', { name: 'Backend server' })).toBeVisible();
        await expect(
            page.getByRole('link', { name: 'View backend API documentation' }),
        ).toBeVisible();

        await expect(page.getByRole('heading', { name: 'LAPIS query engines' })).toBeVisible();
    });

    test('should show LAPIS documentation links for configured organisms', async ({ page }) => {
        await page.goto('/api-documentation');

        await expect(
            page.getByRole('link', { name: /Ebola Sudan LAPIS API documentation/ }),
        ).toBeVisible();
        await expect(
            page.getByRole('link', { name: /Test Dummy Organism LAPIS API documentation/ }),
        ).toBeVisible();
    });
});
