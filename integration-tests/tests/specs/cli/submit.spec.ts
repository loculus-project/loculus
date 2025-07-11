import { expect } from '@playwright/test';
import { cliTest } from '../../fixtures/cli.fixture';

cliTest.describe('CLI Submission', () => {
    const sampleMetadata = `submissionId	sample_name	collection_date	location	host
test_001	sample1	2024-01-01	USA	human
test_002	sample2	2024-01-02	USA	human`;

    const sampleSequences = `>test_001
ATCGATCGATCGATCGATCGATCG
>test_002
ATCGATCGATCGATCGATCGATCG`;

    cliTest('should handle submission workflow', async ({ cliPage, groupId, testAccount }) => {
        // Increase timeout for group creation and submission
        cliTest.setTimeout(60000);
        // Setup: Configure and login
        await cliPage.configure();
        await cliPage.login(testAccount.username, testAccount.password);

        // Step 1: Generate metadata template
        const templateResult = await cliPage.generateTemplate('west-nile');
        expect(templateResult.exitCode).toBe(0);
        expect(templateResult.stdout).toContain('Template generated');

        // Step 2: Submit sequences successfully using the test group
        const submitResult = await cliPage.submitSequences({
            organism: 'west-nile',
            metadata: sampleMetadata,
            sequences: sampleSequences,
            group: parseInt(groupId),
        });

        console.log('Submit result:', {
            exitCode: submitResult.exitCode,
            stdout: submitResult.stdout,
            stderr: submitResult.stderr,
        });
        expect(submitResult.exitCode).toBe(0);
        expect(submitResult.stdout).toContain('Submission successful');
    });
});
