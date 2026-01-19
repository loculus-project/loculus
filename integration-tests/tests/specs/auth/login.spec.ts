import { test } from '../../fixtures/auth.fixture';
import { AuthPage } from '../../pages/auth.page';

test.describe('Login Flow', () => {
    let authPage: AuthPage;

    test.beforeEach(({ page }) => {
        authPage = new AuthPage(page);
    });

    test('should login with valid credentials', async ({ testAccount }) => {
        await authPage.createAccount(testAccount);
        await authPage.logout();
        await authPage.login(testAccount.username, testAccount.password);
    });
});
