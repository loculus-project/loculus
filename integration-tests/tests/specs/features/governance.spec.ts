import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';

test.describe('Test markdown page', () => {
    test('visits test markdown page', async ({ page }) => {
        await page.goto('/-testpage');
        await expect(page.getByText('Governance page goes here')).toBeVisible();
    });
});
