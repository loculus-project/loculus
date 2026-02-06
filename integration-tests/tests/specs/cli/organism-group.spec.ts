import { expect } from '@playwright/test';
import { cliTest } from '../../fixtures/cli.fixture';

cliTest.describe('CLI Organism and Group Commands', () => {
    cliTest('should list available organisms', async ({ cliPage }) => {
        await cliPage.configure();
        await cliPage.login('testuser', 'testuser');

        const result = await cliPage.getAvailableOrganisms();
        cliPage.assertSuccess(result, 'List organisms');

        // The output should contain at least one organism
        expect(result.stdout).toContain('ebola-sudan');
    });

    cliTest(
        'should list available groups after login',
        async ({ cliPage, groupId, groupName, testAccount }) => {
            await cliPage.configure();
            await cliPage.login(testAccount.username, testAccount.password);

            const result = await cliPage.getAvailableGroups();
            cliPage.assertSuccess(result, 'List groups');

            // The output should contain the test group
            expect(result.stdout).toContain(groupName);
            expect(result.stdout).toContain(groupId.toString());
        },
    );

    cliTest('should set and clear default organism', async ({ cliPage }) => {
        await cliPage.configure();
        await cliPage.login('testuser', 'testuser');

        // Set default organism
        const setResult = await cliPage.setDefaultOrganism('ebola-sudan');
        cliPage.assertSuccess(setResult, 'Set default organism');

        // Clear default organism
        const clearResult = await cliPage.clearDefaultOrganism();
        cliPage.assertSuccess(clearResult, 'Clear default organism');
    });

    cliTest('should set and clear default group', async ({ cliPage, groupId }) => {
        await cliPage.configure();
        await cliPage.login('testuser', 'testuser');

        // Set default group
        const setResult = await cliPage.setDefaultGroup(groupId);
        cliPage.assertSuccess(setResult, 'Set default group');

        // Clear default group
        const clearResult = await cliPage.clearDefaultGroup();
        cliPage.assertSuccess(clearResult, 'Clear default group');
    });
});
