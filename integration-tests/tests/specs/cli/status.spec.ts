import { expect } from '@playwright/test';
import { cliTest } from '../../fixtures/cli.fixture';

cliTest.describe('CLI Status Command', () => {
    cliTest(
        'should show sequence status information with test data',
        async ({ cliPage, groupId, testAccount }) => {
            // Increase timeout for status operations
            cliTest.setTimeout(120000);

            // Setup: Configure and login
            await cliPage.configure();
            await cliPage.login(testAccount.username, testAccount.password);

            // Setup test data
            await cliPage.setupTestData({
                organism: 'west-nile',
                group: groupId,
                numSequences: 3,
                withErrors: true,
            });

            // Step 1: Get basic status with explicit group
            const basicStatusResult = await cliPage.getStatus({
                organism: 'west-nile',
                format: 'json',
                group: groupId,
            });
            cliPage.assertSuccess(basicStatusResult, 'Basic status check');

            // Step 2: Get status summary
            const summaryResult = await cliPage.getStatus({
                organism: 'west-nile',
                summary: true,
                format: 'json',
                group: groupId,
            });
            cliPage.assertSuccess(summaryResult, 'Status summary');

            // Parse summary to check structure
            const summaryData = cliPage.parseJsonOutput(summaryResult);
            expect(summaryData).toHaveProperty('total');
            expect(summaryData).toHaveProperty('ready');
            expect(summaryData).toHaveProperty('errors');
            expect(summaryData).toHaveProperty('status_counts');
            expect(summaryData).toHaveProperty('processing_result_counts');

            // Step 3: Test filtering options
            const filteredResult = await cliPage.getStatus({
                organism: 'west-nile',
                status: 'PROCESSED',
                format: 'json',
                group: groupId,
            });
            cliPage.assertSuccess(filteredResult, 'Filtered status check');

            // Step 4: Test convenience filters
            const readyResult = await cliPage.getStatus({
                organism: 'west-nile',
                ready: true,
                format: 'json',
                group: groupId,
            });
            cliPage.assertSuccess(readyResult, 'Ready sequences status');

            const pendingResult = await cliPage.getStatus({
                organism: 'west-nile',
                pending: true,
                format: 'json',
                group: groupId,
            });
            cliPage.assertSuccess(pendingResult, 'Pending sequences status');

            const errorsOnlyResult = await cliPage.getStatus({
                organism: 'west-nile',
                errorsOnly: true,
                format: 'json',
                group: groupId,
            });
            cliPage.assertSuccess(errorsOnlyResult, 'Errors-only status');

            // Step 5: Test pagination
            const paginatedResult = await cliPage.getStatus({
                organism: 'west-nile',
                limit: 10,
                page: 1,
                format: 'json',
                group: groupId,
            });
            cliPage.assertSuccess(paginatedResult, 'Paginated status');

            // Step 6: Test table format (default)
            const tableResult = await cliPage.getStatus({
                organism: 'west-nile',
                limit: 5,
                group: groupId,
            });
            cliPage.assertSuccess(tableResult, 'Table format status');
            // Table format should not be JSON
            expect(() => JSON.parse(tableResult.stdout) as unknown).toThrow();
        },
    );

    cliTest('should handle status command errors gracefully', async ({ cliPage, testAccount }) => {
        // Setup: Configure and login
        await cliPage.configure();
        await cliPage.login(testAccount.username, testAccount.password);

        // Test invalid organism
        const invalidOrganismResult = await cliPage.getStatus({
            organism: 'invalid-organism',
            format: 'json',
        });
        expect(invalidOrganismResult.exitCode).not.toBe(0);
        expect(invalidOrganismResult.stderr).toMatch(/Error|error|fail|Abort/);

        // Test invalid status filter
        const invalidStatusResult = await cliPage.execute([
            'status',
            'west-nile',
            '--status',
            'INVALID_STATUS',
        ]);
        expect(invalidStatusResult.exitCode).not.toBe(0);
        expect(invalidStatusResult.stderr).toMatch(/Invalid value|Error/);

        // Test invalid result filter
        const invalidResultResult = await cliPage.execute([
            'status',
            'west-nile',
            '--result',
            'INVALID_RESULT',
        ]);
        expect(invalidResultResult.exitCode).not.toBe(0);
        expect(invalidResultResult.stderr).toMatch(/Invalid value|Error/);
    });

    cliTest('should handle specific sequence status lookup', async ({ cliPage, testAccount }) => {
        // Setup: Configure and login
        await cliPage.configure();
        await cliPage.login(testAccount.username, testAccount.password);

        // Try to get status for a specific sequence (may not exist, but should handle gracefully)
        const specificResult = await cliPage.getStatus({
            organism: 'west-nile',
            accession: 'LOC_000001',
            version: 1,
            detailed: true,
        });

        // Command should execute (even if sequence doesn't exist)
        // It might return exitCode 0 with "not found" message, or exitCode != 0
        // Either is acceptable behavior
        expect([0, 1]).toContain(specificResult.exitCode);

        if (specificResult.exitCode === 0) {
            // If successful, should show some output about the sequence or lack thereof
            expect(specificResult.stdout.length).toBeGreaterThan(0);
        } else {
            // If failed, should have error message
            expect(specificResult.stderr.length).toBeGreaterThan(0);
        }
    });

    cliTest('should handle group filtering', async ({ cliPage, groupId, testAccount }) => {
        // Setup: Configure and login
        await cliPage.configure();
        await cliPage.login(testAccount.username, testAccount.password);

        // Test group filtering
        const groupFilterResult = await cliPage.getStatus({
            organism: 'west-nile',
            group: groupId,
            format: 'json',
        });
        expect(groupFilterResult.exitCode).toBe(0);

        // Should return valid JSON
        const groupData = cliPage.parseJsonOutput(groupFilterResult);
        expect(Array.isArray(groupData) || typeof groupData === 'object').toBe(true);
    });
});
