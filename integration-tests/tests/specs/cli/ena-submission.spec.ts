import { expect } from '@playwright/test';
import { execSync } from 'child_process';
import { cliTest } from '../../fixtures/cli.fixture';
import {
    getMockEnaState,
    resetMockEnaState,
    waitForMockEnaSamples,
    waitForMockEnaProject,
    checkMockEnaHealth,
} from '../../utils/enaApi';

/**
 * Build the JSON input file format expected by ena_deposition --input-file
 */
function buildEnaSubmissionJson(
    accessionVersion: string,
    organism: string,
    groupId: number,
    metadata: Record<string, unknown>,
    sequences: Record<string, string>,
): Record<string, unknown> {
    return {
        [accessionVersion]: {
            organism,
            metadata: {
                accessionVersion,
                groupId,
                dataUseTerms: 'OPEN',
                ...metadata,
            },
            unalignedNucleotideSequences: sequences,
        },
    };
}

/**
 * Trigger ENA submission by injecting JSON into the ena-submission pod.
 * This starts the ena_deposition process in the background and returns immediately.
 * The ena_deposition process runs in a loop, so we don't wait for it to complete.
 */
function triggerEnaSubmission(inputJson: Record<string, unknown>): void {
    const jsonStr = JSON.stringify(inputJson);

    // First, copy the JSON to the pod
    const escapedJson = jsonStr.replace(/'/g, "'\\''");
    const writeCmd = `kubectl exec deploy/loculus-ena-submission -- sh -c 'echo '"'"'${escapedJson}'"'"' > /tmp/test-submission.json'`;

    try {
        execSync(writeCmd, { timeout: 30000, encoding: 'utf-8' });
    } catch (error) {
        const execError = error as { stderr?: string; stdout?: string };
        console.error('Failed to write JSON to pod:', execError.stderr);
        throw error;
    }

    // Then start ena_deposition in the background using spawn (non-blocking)
    // The process runs in a loop, so we use nohup and redirect output
    const runCmd = `kubectl exec deploy/loculus-ena-submission -- sh -c 'nohup /opt/conda/bin/ena_deposition --config-file=/config/config.yaml --input-file=/tmp/test-submission.json > /tmp/ena-submission.log 2>&1 &'`;

    try {
        execSync(runCmd, { timeout: 30000, encoding: 'utf-8' });
        console.log('ENA submission process started in background');
    } catch (error) {
        const execError = error as { stderr?: string; stdout?: string };
        console.error('Failed to start ena_deposition:', execError.stderr);
        throw error;
    }
}

/**
 * Reset the ENA submission database tables.
 * This clears any existing submission state to ensure clean test runs.
 */
function resetEnaSubmissionDatabase(): void {
    const resetCmd = `kubectl exec deploy/loculus-database -- psql -U postgres -d loculus -c "DELETE FROM ena_deposition_schema.submission_table; DELETE FROM ena_deposition_schema.project_table; DELETE FROM ena_deposition_schema.sample_table; DELETE FROM ena_deposition_schema.assembly_table;" 2>/dev/null || true`;

    try {
        execSync(resetCmd, { timeout: 30000, encoding: 'utf-8' });
        console.log('ENA submission database reset');
    } catch {
        // Ignore errors - tables might not exist yet
        console.log('Note: ENA submission database reset skipped (tables may not exist)');
    }
}

/**
 * Integration tests for ENA submission via mock ENA service.
 *
 * These tests verify that the ena-submission service correctly submits
 * projects and samples to ENA (using the mock ENA service for testing).
 *
 * Prerequisites:
 * - Mock ENA must be enabled (enableMockEna: true in Helm values)
 * - The ena-submission service must be running and configured to use mock ENA
 * - kubectl must be configured to access the cluster
 */
cliTest.describe('ENA Submission Flow', () => {
    cliTest.beforeEach(async () => {
        // Reset mock ENA state before each test
        try {
            await resetMockEnaState();
        } catch {
            // If reset fails, mock ENA might not be available
        }

        // Reset ENA submission database state
        resetEnaSubmissionDatabase();
    });

    cliTest(
        'ena-submission service submits project and sample to mock ENA',
        async ({ groupId }) => {
            // Extended timeout for ENA submission flow
            cliTest.setTimeout(300000); // 5 minutes

            // Check if mock ENA is available
            const mockEnaHealthy = await checkMockEnaHealth();
            if (!mockEnaHealthy) {
                cliTest.skip(true, 'Mock ENA service is not available');
                return;
            }

            // Get initial mock ENA state
            const initialState = await getMockEnaState();
            const initialProjectCount = initialState.projects.length;
            const initialSampleCount = initialState.samples.length;

            // Generate test data - construct the JSON directly
            const timestamp = Date.now();
            const accessionVersion = `LOC_TEST${timestamp}.1`;

            const inputJson = buildEnaSubmissionJson(
                accessionVersion,
                'cchf',
                groupId,
                {
                    // Required metadata fields for ENA submission
                    submissionId: `ena_test_${timestamp}`,
                    authors: 'Test Author; Another Author',
                    authorAffiliations: 'Test Institute',
                    geoLocCountry: 'Germany',
                    sampleCollectionDate: '2024-01-15',
                    hostNameScientific: 'Homo sapiens',
                    hostTaxonId: '9606',
                    specimenCollectorSampleId: `SAMPLE-${timestamp}`,
                },
                {
                    // CCHF has 3 segments: L, M, S
                    L: 'ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG',
                    M: 'GCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTA',
                    S: 'TACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACG',
                },
            );

            // Trigger ENA submission
            triggerEnaSubmission(inputJson);

            // Wait for project creation
            const project = await waitForMockEnaProject(120000);
            expect(project).toBeDefined();
            expect(project.accession).toMatch(/^PRJEB\d+$/);
            console.log(`Project created: ${project.accession}`);

            // Wait for sample creation
            const samples = await waitForMockEnaSamples(initialSampleCount + 1, 180000);

            // Verify sample was created
            expect(samples.length).toBeGreaterThan(initialSampleCount);
            const newSample = samples[samples.length - 1];
            expect(newSample.accession).toMatch(/^ERS\d+$/);
            expect(newSample.biosample_accession).toMatch(/^SAMEA\d+$/);
            console.log(
                `Sample created: ${newSample.accession} (biosample: ${newSample.biosample_accession})`,
            );

            // Final verification
            const finalState = await getMockEnaState();
            expect(finalState.projects.length).toBeGreaterThan(initialProjectCount);
            expect(finalState.samples.length).toBeGreaterThan(initialSampleCount);
        },
    );

    cliTest('mock ENA health check', async () => {
        // Simple test to verify mock ENA is accessible
        const isHealthy = await checkMockEnaHealth();

        if (!isHealthy) {
            cliTest.skip(true, 'Mock ENA service is not available');
            return;
        }

        const state = await getMockEnaState();
        expect(state).toHaveProperty('projects');
        expect(state).toHaveProperty('samples');
        expect(state).toHaveProperty('assemblies');
        expect(Array.isArray(state.projects)).toBe(true);
        expect(Array.isArray(state.samples)).toBe(true);
        expect(Array.isArray(state.assemblies)).toBe(true);
    });
});
