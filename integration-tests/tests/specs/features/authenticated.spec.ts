import { expect } from '@playwright/test';
import { test } from '../../fixtures/auth.fixture';

test.describe('Basic test of authenticated fixture', () => {
    test('authenticated fixture runs and lands on user page', async ({
        page,
        authenticatedUser,
    }) => {
        void authenticatedUser;
        // Account creation starts from /user, so after (auto-)login the user lands on
        // the account page, not the homepage.
        await expect(page).toHaveURL('/user');
        await expect(page.getByRole('link', { name: 'My account' })).toBeVisible();
    });
});
