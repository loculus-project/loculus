import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';

test.describe('Footer links', () => {
    test('should display footer with Docs and API docs links', async ({ page }) => {
        await page.goto('/');

        // Scroll to footer
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

        const docsLink = page.getByRole('link', { name: 'Docs', exact: true });
        await expect(docsLink).toBeVisible();

        const apiDocsLink = page.getByRole('link', { name: 'API docs', exact: true });
        await expect(apiDocsLink).toBeVisible();
    });

    test('should navigate to API documentation page from footer', async ({ page }) => {
        await page.goto('/');

        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

        await page.getByRole('link', { name: 'API docs', exact: true }).click();
        await expect(page).toHaveTitle(/API documentation/);
    });
});
