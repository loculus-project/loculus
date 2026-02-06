import { expect } from '@playwright/test';
import { cliTest } from '../../fixtures/cli.fixture';

cliTest.describe('CLI Authentication', () => {
    cliTest('should handle complete authentication workflow', async ({ cliPage }) => {
        // Step 1: Configure CLI instance
        await cliPage.configure();

        // Check configuration
        const configResult = await cliPage.executeAndAssertSuccess(
            ['instance'],
            'Check instance configuration',
        );
        // Should contain the instance URL from PLAYWRIGHT_TEST_BASE_URL

        expect(configResult.stdout).toContain('Accessible');

        // Step 2: Show not logged in status initially
        const initialStatusResult = await cliPage.authStatus();
        cliPage.assertSuccess(initialStatusResult, 'Check initial auth status');
        expect(initialStatusResult.stdout).toContain('Not logged in');

        // Step 3: Fail login with invalid credentials
        const invalidLoginResult = await cliPage.login('invalid_user', 'invalid_password');
        expect(invalidLoginResult.exitCode).not.toBe(0);
        expect(invalidLoginResult.stderr).toContain('Invalid username or password');

        // Step 4: Login with valid credentials
        const validLoginResult = await cliPage.login('testuser', 'testuser');
        cliPage.assertSuccess(validLoginResult, 'Valid login');
        expect(validLoginResult.stdout).toContain('Successfully logged in');

        // Check that we're now authenticated
        const loggedInStatusResult = await cliPage.authStatus();
        cliPage.assertSuccess(loggedInStatusResult, 'Check logged in status');
        expect(loggedInStatusResult.stdout).toContain('Logged in as');

        // Step 5: Logout successfully
        const logoutResult = await cliPage.logout();
        cliPage.assertSuccess(logoutResult, 'Logout');
        expect(logoutResult.stdout).toContain('Successfully logged out');

        // Check that we're no longer authenticated
        const finalStatusResult = await cliPage.authStatus();
        cliPage.assertSuccess(finalStatusResult, 'Check final auth status');
        expect(finalStatusResult.stdout).toContain('Not logged in');
    });
});
