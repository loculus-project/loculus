import { expect } from '@playwright/test';
import { test } from '../../fixtures/auth.fixture';
import { MyAccountPage } from '../../pages/my-account.page';

test.describe('Test redirect to Edit Account page', () => {
    test('Edit account information link has correct href', async ({ page, authenticatedUser }) => {
        void authenticatedUser;
        const myAccountPage = new MyAccountPage(page);
        await myAccountPage.goto();
        await myAccountPage.expectEditAccountLinkHasCorrectHref();
    });

    test('Edit account information opens Keycloak account management page', async ({
        page,
        authenticatedUser,
    }) => {
        void authenticatedUser;
        const myAccountPage = new MyAccountPage(page);
        await myAccountPage.goto();

        const keycloakPage = await myAccountPage.clickEditAccountAndGetKeycloakPage();
        await expect(keycloakPage).toHaveTitle('Keycloak Account Management');
        await keycloakPage.close();
    });
});
