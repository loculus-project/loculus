import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';

test.describe('Landing page statistics', () => {
    test('should display organism cards with sequence counts', async ({ page }) => {
        await page.goto('/');

        await expect(page.getByText('Explore Loculus data!')).toBeVisible();

        // Each organism card shows the total sequences count and a "sequences" label
        // The count is in a <span class='font-bold'> and "sequences" is adjacent text
        const ebolaCard = page.getByRole('link', { name: /Ebola Sudan/ });
        await expect(ebolaCard).toBeVisible();

        // Verify the card contains the word "sequences" (the count is rendered separately)
        await expect(ebolaCard.getByText('sequences')).toBeVisible();
    });

    test('should display recent submission period on organism cards', async ({ page }) => {
        await page.goto('/');

        // Organism cards show "in last N days" stats
        const firstCard = page.getByRole('link', { name: /Ebola Sudan/ });
        await expect(firstCard.getByText(/in last \d+ days/)).toBeVisible();
    });

    test('should link organism cards to their search pages', async ({ page }) => {
        await page.goto('/');

        const ebolaCard = page.getByRole('link', { name: /Ebola Sudan/ });
        await expect(ebolaCard).toBeVisible();
        await ebolaCard.click();

        // Organism page redirects to search
        await page.waitForURL(/\/ebola-sudan\/search/);
        await expect(page.getByText(/Search returned \d+ sequence/)).toBeVisible();
    });
});
