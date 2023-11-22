import { baseUrl, expect, test } from '../../e2e.fixture';

test.describe('The user page', () => {
    test('should have usable logout button', async ({ userPage, loginAsTestUser }) => {
        await loginAsTestUser();

        await userPage.goToUserPage();

        await userPage.logout();

        await expect(userPage.page).toHaveURL(`${baseUrl}/logout`);
        await expect(userPage.page.context().cookies(baseUrl)).resolves.toEqual([]);
    });
});
