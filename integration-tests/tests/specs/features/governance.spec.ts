import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';

test.describe('Governance page', () => {
    test('displays Governance heading', async ({ page }) => {
        await page.goto('/-testpage');
        await expect(page.getByText('Governance')).toBeVisible();
    });
});
