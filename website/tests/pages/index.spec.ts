import { test, expect, baseUrl } from '../e2e.fixture';

test.describe('The landing page', () => {
    test('contains an organism', async ({ page }) => {
        await page.goto(baseUrl);

        expect(await page.textContent('text=Dummy Organism')).toBeTruthy();
    });
});
