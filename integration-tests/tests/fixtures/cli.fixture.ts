import { test } from './group.fixture';
import { TestCliPage } from '../pages/CliPage';

export const cliTest = test.extend<{
    cliPage: TestCliPage;
}>({
    cliPage: async ({ groupName, groupId, testAccount }, use) => {
        // Create CLI page - it will authenticate using the created user credentials
        // and have access to the created group
        const cliPage = new TestCliPage();

        // Store test info for CLI tests to use
        cliPage.testGroupName = groupName;
        cliPage.testGroupId = groupId;
        cliPage.testAccount = testAccount;

        // Clean up any existing state before the test
        await cliPage.cleanup();

        try {
            await use(cliPage);
        } finally {
            // Clean up after the test
            await cliPage.cleanup();
        }
    },
});
