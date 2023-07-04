import { test, expect } from '@playwright/test';

test('has strain field', async ({ page }) => {
  await page.goto('http://localhost:3001/sequences/OU189322');

  const content = await page.textContent('body');
  await expect(content?.includes('strain')).toBeTruthy();
});
