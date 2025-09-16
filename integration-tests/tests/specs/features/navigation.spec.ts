import { expect } from '@playwright/test';

import { test } from '../../fixtures/auth.fixture';

const organismName = 'Test Dummy Organism';

const organismIndependentNavigationItems = [
    { link: 'My account', title: 'My account' },
    { link: 'API docs', title: 'API documentation' },
];

const organismNavigationItems = [
    { link: 'Browse', title: '[Organism] - Browse' },
    { link: 'Submit', title: 'Submission portal' },
    { link: 'My account', title: 'My account' },
];

test.describe('Top navigation', () => {
    test('should navigate to the expected pages', async ({ pageWithACreatedUser }) => {
        const page = pageWithACreatedUser;

        const expectTitle = async (title: string) => {
            await expect(page).toHaveTitle(new RegExp(`^${title}`));
        };

        await page.goto('/');

        for (const { link, title } of organismIndependentNavigationItems) {
            await page.getByRole('link', { name: link, exact: true }).click();
            await expectTitle(title);
        }

        await page.locator('header').getByText('Organisms', { exact: true }).click();
        await page.getByRole('link', { name: organismName, exact: true }).first().click();
        await expectTitle(`${organismName} - Browse`);

        for (const { link, title } of organismNavigationItems) {
            await page.getByRole('link', { name: link, exact: true }).click();
            await expectTitle(title.replace('[Organism]', organismName));
        }
    });
});
