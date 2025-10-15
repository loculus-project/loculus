import { expect } from '@playwright/test';
import { test } from '../../fixtures/auth.fixture';

test.describe('Basic test of authenticated fixture', () => {
    test('authenticated fixture runs and lands on user page', async ({ pageWithACreatedUser }) => {
        await expect(pageWithACreatedUser).toHaveURL('/');
        await expect(pageWithACreatedUser.getByRole('link', { name: 'My account' })).toBeVisible();
        await expect(pageWithACreatedUser).toHaveScreenshot('authenticated-home.png');
    });
});
