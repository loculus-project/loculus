import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('http://localhost:3001/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle('Home');
});

test('has header', async ({ page }) => {
  await page.goto('http://localhost:3001/');

  // Expects the URL to contain intro.
  await expect(page.locator('h1')).toContainText('My first Astro application');
});
