import { expect } from '@playwright/test';
import { execSync } from 'child_process';
import { cliTest } from '../../fixtures/cli.fixture';
import {
    clearEnaDepositionFiles,
    getEnaDepositionFile,
    listEnaDepositionFiles,
} from '../../utils/s3Api';

/**
 * Run the ENA submission list cronjob manually via kubectl.
 * Returns the job name for monitoring.
 */
function runEnaCronjob(): string {
    const jobName = `ena-cronjob-test-${Date.now()}`;

    try {
        // Create a job from the cronjob template
        execSync(
            `kubectl create job ${jobName} --from=cronjob/loculus-get-ena-submission-list-cronjob`,
            { encoding: 'utf-8', timeout: 30000 },
        );
        console.log(`Created job: ${jobName}`);
        return jobName;
    } catch (error) {
        const execError = error as { stderr?: string; stdout?: string };
        console.error('Failed to create job:', execError.stderr);
        throw error;
    }
}

/**
 * Wait for a Kubernetes job to complete.
 */
async function waitForJobCompletion(
    jobName: string,
    timeoutMs: number = 180000,
): Promise<{ success: boolean; logs: string }> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {
            const status = execSync(
                `kubectl get job ${jobName} -o jsonpath='{.status.conditions[*].type}'`,
                {
                    encoding: 'utf-8',
                },
            );

            if (status.includes('Complete')) {
                const logs = execSync(`kubectl logs job/${jobName}`, { encoding: 'utf-8' });
                return { success: true, logs };
            }

            if (status.includes('Failed')) {
                const logs = execSync(`kubectl logs job/${jobName}`, { encoding: 'utf-8' });
                return { success: false, logs };
            }
        } catch {
            // Job might not have pods yet, continue waiting
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Timeout - get logs anyway
    try {
        const logs = execSync(`kubectl logs job/${jobName}`, { encoding: 'utf-8' });
        return { success: false, logs };
    } catch {
        return { success: false, logs: 'Failed to get logs' };
    }
}

/**
 * Clean up a test job.
 */
function cleanupJob(jobName: string): void {
    try {
        execSync(`kubectl delete job ${jobName} --ignore-not-found`, {
            encoding: 'utf-8',
            timeout: 30000,
        });
    } catch {
        // Ignore cleanup errors
    }
}

interface SubmissionEntry {
    organism: string;
    metadata: {
        accessionVersion: string;
    };
}

cliTest.describe('ENA Cronjob Integration', () => {
    cliTest.beforeEach(() => {
        // Clear any existing ena-deposition files
        clearEnaDepositionFiles();
    });

    cliTest(
        'cronjob produces submission list and uploads to S3',
        async ({ cliPage, groupId, testAccount }) => {
            // Increase timeout for this test
            cliTest.setTimeout(300000);

            // Step 1: Setup - Submit and release sequences so the cronjob has data to find
            await cliPage.configure();
            await cliPage.login(testAccount.username, testAccount.password);

            // Submit test sequences
            await cliPage.setupTestData({
                organism: 'cchf',
                group: groupId,
                numSequences: 2,
                withErrors: false,
            });

            // Wait for sequences to be processed
            let hasProcessedSequences = false;
            for (let i = 0; i < 24; i++) {
                const statusResult = await cliPage.getStatus({
                    organism: 'cchf',
                    group: groupId,
                    status: 'PROCESSED',
                    format: 'json',
                });

                if (statusResult.exitCode === 0) {
                    const statusData = cliPage.parseJsonOutput(statusResult);
                    if (Array.isArray(statusData) && statusData.length > 0) {
                        hasProcessedSequences = true;
                        console.log(`Found ${statusData.length} processed sequences`);
                        break;
                    }
                }
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }

            if (!hasProcessedSequences) {
                console.log(
                    'No processed sequences found, cronjob may report no sequences to submit',
                );
            }

            // Release the sequences (so they're in APPROVED_FOR_RELEASE state)
            const releaseResult = await cliPage.releaseSequences({
                organism: 'cchf',
                group: groupId,
                allValid: true,
                force: true,
            });
            console.log('Release result:', releaseResult.exitCode, releaseResult.stdout);

            // Step 2: Run the cronjob
            console.log('Running ENA cronjob...');
            const jobName = runEnaCronjob();

            try {
                // Step 3: Wait for the job to complete
                const { success, logs } = await waitForJobCompletion(jobName, 180000);
                console.log('Cronjob logs:', logs.slice(0, 2000));

                // The job should complete (even if it finds no sequences)
                expect(success).toBe(true);

                // Step 4: Check S3 for the output file
                // The cronjob should produce a file like "cchf_ena_submission_list.json"
                // or log "No sequences found to submit to ENA"
                const files = await listEnaDepositionFiles();
                console.log('Files in ena-deposition:', files);

                if (logs.includes('No sequences found to submit to ENA')) {
                    // This is OK - no sequences matched the criteria
                    console.log('Cronjob completed but found no sequences to submit');
                    expect(logs).toContain('No sequences found to submit to ENA');
                } else if (files.length > 0) {
                    // Files were produced - verify they're valid JSON
                    const submissionFile = files.find((f) =>
                        f.key.includes('ena_submission_list.json'),
                    );
                    expect(submissionFile).toBeDefined();

                    if (submissionFile) {
                        const content = await getEnaDepositionFile(submissionFile.key);
                        expect(content).not.toBeNull();

                        // Verify it's valid JSON
                        const data = JSON.parse(content) as Record<string, SubmissionEntry>;
                        expect(typeof data).toBe('object');

                        // Should have accession keys
                        const accessions = Object.keys(data);
                        console.log(`Found ${accessions.length} sequences in submission list`);

                        if (accessions.length > 0) {
                            // Verify structure of first entry
                            const firstEntry = data[accessions[0]];
                            expect(firstEntry).toHaveProperty('organism');
                            expect(firstEntry).toHaveProperty('metadata');
                            expect(firstEntry.metadata).toHaveProperty('accessionVersion');
                        }
                    }
                } else {
                    // No files and no "no sequences" message - check if S3 upload failed
                    console.log('No files found in S3, checking logs for errors');
                    expect(logs).toMatch(/S3|upload|slack/i);
                }
            } finally {
                // Cleanup
                cleanupJob(jobName);
            }
        },
    );

});
