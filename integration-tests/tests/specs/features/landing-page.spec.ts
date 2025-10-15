import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';

const ORGANISM_LINK_TEXT = 'Test Dummy Organism';

test.describe('Landing page', () => {
    test('shows featured organism', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('link', { name: ORGANISM_LINK_TEXT })).toBeVisible();

        // Visual regression test
        await expect(page).toHaveScreenshot('landing-page.png');
    });
});
