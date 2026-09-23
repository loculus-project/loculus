import { test } from '../../fixtures/auth.fixture';
import { expect } from '@playwright/test';
import { NavigationPage } from '../../pages/navigation.page';

const organismName = 'Test Dummy Organism';

const organismIndependentNavigationItems = [
    { link: 'My account', title: 'My account' },
    { link: 'API docs', title: 'API documentation' },
];

const organismNavigationItems = [
    { link: 'Browse data', title: '[Organism] - Browse' },
    { link: 'Submit sequences', title: 'Submission portal' },
    { link: 'My account', title: 'My account' },
];

test.describe('Top navigation', () => {
    test('should navigate to the expected pages', async ({ page, authenticatedUser }) => {
        void authenticatedUser;
        const navigation = new NavigationPage(page);

        await navigation.page.goto('/');

        for (const { link, title } of organismIndependentNavigationItems) {
            await navigation.clickLink(link);
            await navigation.expectTitle(title);
        }

        await navigation.openOrganismNavigation();
        await navigation.selectOrganism(organismName);
        await navigation.expectTitle(`${organismName} - Browse`);

        for (const { link, title } of organismNavigationItems) {
            await navigation.clickLink(link);
            await navigation.expectTitle(title.replace('[Organism]', organismName));
        }
    });
});

test.describe('Organism menu', () => {
    // Prevents: https://github.com/loculus-project/loculus/issues/7388
    test('fits in a short window and scrolls to reach every organism', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 400 });
        await page.goto('/');

        const navigation = new NavigationPage(page);
        await navigation.openOrganismNavigation();

        const menu = page.getByRole('menu');
        await expect(menu).toBeVisible();
        const menuBox = await menu.boundingBox();
        expect(menuBox).not.toBeNull();
        expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(400);

        const lastOrganism = menu.getByRole('menuitem').last();
        await lastOrganism.scrollIntoViewIfNeeded();
        await expect(lastOrganism).toBeInViewport();
    });
});
