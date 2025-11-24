import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';
import { NavigationPage } from '../../pages/navigation.page';

test.describe('Submission page login requirements', () => {
    test('should ask to login if not logged in', async ({ page }) => {
        await page.goto('/');

        const navigation = new NavigationPage(page);
        await navigation.openOrganismNavigation();
        await navigation.selectOrganism('Ebola Sudan');
        await navigation.clickSubmitSequences();

        const loginLink = page.getByRole('link', { name: 'Login or register' });
        await expect(loginLink).toBeVisible();

        await loginLink.click();
        await expect(page).toHaveURL(/realms\/loculus/);
    });
});
