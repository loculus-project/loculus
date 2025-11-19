import { expect } from '@playwright/test';
import { test } from '../../fixtures/auth.fixture';

test.describe('Basic test of authenticated fixture', () => {
    test('authenticated fixture runs and lands on user page', async ({ page, authenticatedUser }) => {
        void authenticatedUser;
        await expect(page).toHaveURL('/');
        await expect(page.getByRole('link', { name: 'My account' })).toBeVisible();
    });
});
