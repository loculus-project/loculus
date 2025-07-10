import { expect } from '@playwright/test';
import { cliTest } from '../../fixtures/cli.fixture';

cliTest.describe('CLI Authentication', () => {
  cliTest('should handle complete authentication workflow', async ({ cliPage }) => {
    // Step 1: Configure CLI instance
    await cliPage.configure();
    
    // Check configuration
    const configResult = await cliPage.execute(['config', 'get', 'default_instance']);
    expect(configResult.exitCode).toBe(0);
    // Should contain the instance URL from PLAYWRIGHT_TEST_BASE_URL (without protocol)
    const expectedInstance = (process.env.PLAYWRIGHT_TEST_BASE_URL || 'localhost:3000').replace(/https?:\/\//, '');
    expect(configResult.stdout).toContain(expectedInstance);

    // Step 2: Show not logged in status initially
    const initialStatusResult = await cliPage.authStatus();
    expect(initialStatusResult.exitCode).toBe(0);
    expect(initialStatusResult.stdout).toContain('Not logged in');

    // Step 3: Fail login with invalid credentials
    const invalidLoginResult = await cliPage.login('invalid_user', 'invalid_password');
    expect(invalidLoginResult.exitCode).not.toBe(0);
    expect(invalidLoginResult.stderr).toContain('Invalid username or password');

    // Step 4: Login with valid credentials
    const validLoginResult = await cliPage.login('testuser', 'testuser');
    expect(validLoginResult.exitCode).toBe(0);
    expect(validLoginResult.stdout).toContain('Successfully logged in');
    
    // Check that we're now authenticated
    const loggedInStatusResult = await cliPage.authStatus();
    expect(loggedInStatusResult.exitCode).toBe(0);
    expect(loggedInStatusResult.stdout).toContain('Logged in as');

    // Step 5: Logout successfully
    const logoutResult = await cliPage.logout();
    expect(logoutResult.exitCode).toBe(0);
    expect(logoutResult.stdout).toContain('Successfully logged out');
    
    // Check that we're no longer authenticated
    const finalStatusResult = await cliPage.authStatus();
    expect(finalStatusResult.exitCode).toBe(0);
    expect(finalStatusResult.stdout).toContain('Not logged in');
  });
});