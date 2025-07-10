import { test } from './group.fixture';
import { CliPage } from '../pages/CliPage';

export const cliTest = test.extend<{
  cliPage: CliPage;
}>({
  cliPage: async ({ pageWithGroup, groupName, groupId, testAccount }, use) => {
    // Create CLI page - it will authenticate using the created user credentials
    // and have access to the created group
    const cliPage = new CliPage();
    
    // Store test info for CLI tests to use
    (cliPage as any).testGroupName = groupName;
    (cliPage as any).testGroupId = parseInt(groupId);
    (cliPage as any).testAccount = testAccount;
    
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