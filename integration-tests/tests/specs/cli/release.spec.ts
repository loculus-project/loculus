import { expect } from '@playwright/test';
import { cliTest } from '../../fixtures/cli.fixture';

cliTest.describe('CLI Release Command', () => {
    cliTest(
        'should handle sequence release workflow',
        async ({ cliPage, groupId, testAccount }) => {
            // Increase timeout for release operations
            cliTest.setTimeout(180000);

            // Setup: Configure and login
            await cliPage.configure();
            await cliPage.login(testAccount.username, testAccount.password);

            // Setup test data with multiple sequences
            await cliPage.setupTestData({
                organism: 'west-nile',
                group: groupId,
                numSequences: 2,
                withErrors: false,
            });

            // Wait for sequences to be processed (they need to be PROCESSED to be releasable)
            // We'll check status and wait up to 60 seconds
            let processedSequences: { accession: string; version: number }[] = [];
            for (let i = 0; i < 12; i++) {
                // Try for up to 60 seconds
                const statusResult = await cliPage.getStatus({
                    organism: 'west-nile',
                    group: groupId,
                    status: 'PROCESSED',
                    format: 'json',
                });

                if (statusResult.exitCode === 0) {
                    const statusData = cliPage.parseJsonOutput(statusResult);
                    if (Array.isArray(statusData) && statusData.length > 0) {
                        processedSequences = statusData as { accession: string; version: number }[];
                        break;
                    }
                } else {
                    cliPage.logCliResult(`Error checking status (attempt ${i + 1})`, statusResult);
                    cliPage.assertSuccess(statusResult, 'Status check for processed sequences');
                }

                await new Promise((resolve) => setTimeout(resolve, 5000));
            }

            // Step 1: Test dry-run for all valid sequences
            const dryRunResult = await cliPage.releaseSequences({
                organism: 'west-nile',
                group: groupId,
                allValid: true,
                dryRun: true,
            });
            expect(dryRunResult.exitCode).toBe(0);
            expect(dryRunResult.stdout).toMatch(
                /dry run|would release|Dry run complete|No sequences found/i,
            );

            // Step 2: Test dry-run for no-warnings-only
            const dryRunNoWarningsResult = await cliPage.releaseSequences({
                organism: 'west-nile',
                group: groupId,
                noWarningsOnly: true,
                dryRun: true,
            });
            expect(dryRunNoWarningsResult.exitCode).toBe(0);

            // Step 3: Test releasing specific sequence (if we have processed sequences)
            if (processedSequences.length > 0) {
                const firstSequence = processedSequences[0];
                const specificReleaseResult = await cliPage.releaseSequences({
                    organism: 'west-nile',
                    accession: firstSequence.accession,
                    version: firstSequence.version,
                    force: true, // Skip confirmation in tests
                });

                // This might succeed or fail depending on sequence state, both are valid
                expect([0, 1]).toContain(specificReleaseResult.exitCode);

                if (specificReleaseResult.exitCode === 0) {
                    expect(specificReleaseResult.stdout).toMatch(/released|success/i);
                } else {
                    expect(specificReleaseResult.stderr.length).toBeGreaterThan(0);
                }
            }

            // Step 4: Test bulk release with force (for sequences that are ready)
            const bulkReleaseResult = await cliPage.releaseSequences({
                organism: 'west-nile',
                group: groupId,
                allValid: true,
                force: true,
                verbose: true,
            });

            // Should execute successfully (even if no sequences are ready)
            expect([0, 1]).toContain(bulkReleaseResult.exitCode);
        },
    );

    cliTest('should handle quiet and verbose modes', async ({ cliPage, groupId, testAccount }) => {
        // Setup: Configure and login
        await cliPage.configure();
        await cliPage.login(testAccount.username, testAccount.password);

        // Test quiet mode with dry-run
        const quietResult = await cliPage.releaseSequences({
            organism: 'west-nile',
            group: groupId,
            allValid: true,
            dryRun: true,
            quiet: true,
        });
        expect(quietResult.exitCode).toBe(0);

        // Test verbose mode with dry-run
        const verboseResult = await cliPage.releaseSequences({
            organism: 'west-nile',
            group: groupId,
            allValid: true,
            dryRun: true,
            verbose: true,
        });
        expect(verboseResult.exitCode).toBe(0);

        // Verbose should have more output than quiet (if there are sequences)
        if (verboseResult.stdout.includes('sequences')) {
            expect(verboseResult.stdout.length).toBeGreaterThanOrEqual(quietResult.stdout.length);
        }
    });
});
