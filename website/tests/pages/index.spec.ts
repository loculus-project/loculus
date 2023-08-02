import { test, expect, baseUrl } from '../e2e.fixture';

test.describe('The landing page', () => {
    test('has title and header', async ({ page }) => {
        await page.goto(baseUrl);

        await expect(page).toHaveTitle('Home');
        await expect(page.locator('h1')).toContainText('Pathoplexus');
    });
});
