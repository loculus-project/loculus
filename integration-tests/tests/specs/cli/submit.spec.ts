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

        // Step 1: Generate metadata template to temp directory
        const templatePath = '/tmp/metadata_template.tsv';
        const templateResult = await cliPage.generateTemplate('west-nile', templatePath);
        cliPage.assertSuccess(templateResult, 'Generate metadata template');
        expect(templateResult.stdout).toContain('Template generated');

        // Step 2: Submit sequences successfully using the test group
        const submitResult = await cliPage.submitSequences({
            organism: 'west-nile',
            metadata: sampleMetadata,
            sequences: sampleSequences,
            group: groupId,
        });

        cliPage.logCliResult('Submit sequences', submitResult, true);
        cliPage.assertSuccess(submitResult, 'Submit sequences');
        expect(submitResult.stdout).toContain('Submission successful');
    });
});
