import { expect, test } from '@playwright/test';
import { execSync } from 'child_process';
import {
    checkEnaDepositionHealth,
    checkMockEnaHealth,
    getEnaDepositionApiHealth,
    getEnaSubmissions,
    getEnaSubmissionDetail,
    getEnaErrors,
    submitToEna,
    resetMockEnaState,
    waitForMockEnaProject,
    waitForMockEnaSamples,
    waitForMockEnaAssemblies,
    waitForSubmissionStatus,
} from '../../utils/enaApi';

// For ENA API tests, we use a static group ID since we're testing the ENA deposition API,
// not the Loculus group management flow. The group ID is just metadata stored with submissions.
const TEST_GROUP_ID = 1;

/**
 * Ensure a test group exists in the database for ENA submissions.
 * The ENA submission pipeline needs valid group info to create projects.
 */
function ensureTestGroupExists(): void {
    const insertCmd = `kubectl exec deploy/loculus-database -- psql -U postgres -d loculus -c "INSERT INTO groups_table (group_id, group_name, institution, address_line_1, address_line_2, address_city, address_postal_code, address_state, address_country, contact_email) VALUES (${TEST_GROUP_ID}, 'ENA Test Group', 'Test Institute', '123 Test Street', '', 'Test City', '12345', '', 'Germany', 'test@example.com') ON CONFLICT (group_id) DO NOTHING;" 2>/dev/null || true`;

    try {
        execSync(insertCmd, { timeout: 30000, encoding: 'utf-8' });
        console.log('Test group ensured');
    } catch {
        console.log('Note: Test group creation skipped (may already exist or DB not accessible)');
    }
}

/**
 * Reset the ENA submission database tables.
 */
function resetEnaSubmissionDatabase(): void {
    const resetCmd = `kubectl exec deploy/loculus-database -- psql -U postgres -d loculus -c "DELETE FROM ena_deposition_schema.submission_table; DELETE FROM ena_deposition_schema.project_table; DELETE FROM ena_deposition_schema.sample_table; DELETE FROM ena_deposition_schema.assembly_table;" 2>/dev/null || true`;

    try {
        execSync(resetCmd, { timeout: 30000, encoding: 'utf-8' });
        console.log('ENA submission database reset');
    } catch {
        console.log('Note: ENA submission database reset skipped (tables may not exist)');
    }
}

/**
 * Integration tests for the ENA Deposition FastAPI endpoints.
 *
 * These tests verify the new API endpoints for managing ENA depositions.
 * These are pure API tests that don't require website authentication.
 */
test.describe('ENA Deposition API', () => {
    // Run tests serially to avoid race conditions with database resets
    test.describe.configure({ mode: 'serial' });
    test.beforeEach(async () => {
        // Reset mock ENA state before each test
        try {
            await resetMockEnaState();
        } catch {
            // If reset fails, mock ENA might not be available
        }

        // Ensure test group exists (needed for full flow tests)
        ensureTestGroupExists();

        // Reset ENA submission database state
        resetEnaSubmissionDatabase();
    });

    test('API health check returns healthy status', async () => {
        const isHealthy = await checkEnaDepositionHealth();

        if (!isHealthy) {
            test.skip(true, 'ENA Deposition API is not available');
            return;
        }

        const health = await getEnaDepositionApiHealth();
        expect(health.status).toBe('ok');
        expect(health.message).toBeDefined();
    });

    test('GET /api/submissions returns empty list initially', async () => {
        const isHealthy = await checkEnaDepositionHealth();

        if (!isHealthy) {
            test.skip(true, 'ENA Deposition API is not available');
            return;
        }

        const submissions = await getEnaSubmissions();

        expect(submissions).toHaveProperty('items');
        expect(submissions).toHaveProperty('total');
        expect(submissions).toHaveProperty('page');
        expect(submissions).toHaveProperty('size');
        expect(Array.isArray(submissions.items)).toBe(true);
        expect(submissions.total).toBe(0);
    });

    test('GET /api/errors returns empty list initially', async () => {
        const isHealthy = await checkEnaDepositionHealth();

        if (!isHealthy) {
            test.skip(true, 'ENA Deposition API is not available');
            return;
        }

        const errors = await getEnaErrors();

        expect(errors).toHaveProperty('items');
        expect(errors).toHaveProperty('total');
        expect(Array.isArray(errors.items)).toBe(true);
        expect(errors.total).toBe(0);
    });

    test('POST /api/submissions/submit creates a new submission', async () => {
        test.setTimeout(480000); // 8 minutes

        const isApiHealthy = await checkEnaDepositionHealth();
        const isMockEnaHealthy = await checkMockEnaHealth();

        if (!isApiHealthy || !isMockEnaHealthy) {
            test.skip(true, 'ENA Deposition API or Mock ENA is not available');
            return;
        }

        const timestamp = Date.now();
        const accession = `LOC_API_TEST${timestamp}`;

        // Submit via the API
        const submitResponse = await submitToEna([
            {
                accession,
                version: 1,
                organism: 'cchf',
                group_id: TEST_GROUP_ID,
                metadata: {
                    accessionVersion: `${accession}.1`,
                    groupId: TEST_GROUP_ID,
                    dataUseTerms: 'OPEN',
                    submissionId: `api_test_${timestamp}`,
                    authors: 'API Test Author',
                    authorAffiliations: 'Test Institute',
                    geoLocCountry: 'Germany',
                    sampleCollectionDate: '2024-01-15',
                    hostNameScientific: 'Homo sapiens',
                    hostTaxonId: '9606',
                    specimenCollectorSampleId: `API-SAMPLE-${timestamp}`,
                },
                unaligned_nucleotide_sequences: {
                    L: 'ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG',
                    M: 'GCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTA',
                    S: 'TACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACG',
                },
            },
        ]);

        expect(submitResponse.submitted).toContain(`${accession}.1`);
        expect(submitResponse.errors).toHaveLength(0);

        console.log(`Submission created: ${accession}.1`);

        // Verify submission appears in the list
        const submissions = await getEnaSubmissions();
        expect(submissions.total).toBeGreaterThan(0);

        const submission = submissions.items.find((s) => s.accession === accession);
        expect(submission).toBeDefined();
        expect(submission.status_all).toBe('READY_TO_SUBMIT');
        expect(submission.organism).toBe('cchf');
        expect(submission.group_id).toBe(TEST_GROUP_ID);

        console.log(`Submission verified in list: ${accession}`);

        // Get submission detail
        const detail = await getEnaSubmissionDetail(accession, 1);
        expect(detail.accession).toBe(accession);
        expect(detail.version).toBe(1);
        expect(detail.status_all).toBe('READY_TO_SUBMIT');

        console.log(`Submission detail retrieved: ${accession}`);
    });

    test('Full API-driven submission flow: submit and wait for completion', async () => {
        test.setTimeout(600000); // 10 minutes for full flow

        const isApiHealthy = await checkEnaDepositionHealth();
        const isMockEnaHealthy = await checkMockEnaHealth();

        if (!isApiHealthy || !isMockEnaHealthy) {
            test.skip(true, 'ENA Deposition API or Mock ENA is not available');
            return;
        }

        const timestamp = Date.now();
        const accession = `LOC_FULL_API${timestamp}`;

        // Submit via the API
        console.log('Submitting via API...');
        const submitResponse = await submitToEna([
            {
                accession,
                version: 1,
                organism: 'cchf',
                group_id: TEST_GROUP_ID,
                metadata: {
                    accessionVersion: `${accession}.1`,
                    groupId: TEST_GROUP_ID,
                    dataUseTerms: 'OPEN',
                    submissionId: `full_api_test_${timestamp}`,
                    authors: 'Test, Author',
                    authorAffiliations: 'Test Institute',
                    geoLocCountry: 'Germany',
                    sampleCollectionDate: '2024-01-15',
                    hostNameScientific: 'Homo sapiens',
                    hostTaxonId: '9606',
                    specimenCollectorSampleId: `FULL-API-SAMPLE-${timestamp}`,
                },
                unaligned_nucleotide_sequences: {
                    L: 'ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG',
                    M: 'GCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTA',
                    S: 'TACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACG',
                },
            },
        ]);

        expect(submitResponse.submitted).toContain(`${accession}.1`);
        console.log('Submission accepted');

        // Wait for project creation in mock ENA
        console.log('Waiting for project creation in mock ENA...');
        const project = await waitForMockEnaProject(120000);
        expect(project.accession).toMatch(/^PRJEB\d+$/);
        console.log(`Project created: ${project.accession}`);

        // Wait for sample creation
        console.log('Waiting for sample creation in mock ENA...');
        const samples = await waitForMockEnaSamples(1, 180000);
        expect(samples.length).toBeGreaterThanOrEqual(1);
        console.log(`Sample created: ${samples[0].accession}`);

        // Wait for assembly submission
        console.log('Waiting for assembly submission...');
        const assemblies = await waitForMockEnaAssemblies(1, 240000);
        expect(assemblies.length).toBeGreaterThanOrEqual(1);
        expect(assemblies[0].erz_accession).toMatch(/^ERZ\d+$/);
        console.log(`Assembly created: ${assemblies[0].erz_accession}`);

        // Verify final submission status via API
        console.log('Verifying final submission status...');
        const finalDetail = await waitForSubmissionStatus(accession, 1, 'SENT_TO_LOCULUS', 300000);
        expect(finalDetail.status_all).toBe('SENT_TO_LOCULUS');
        expect(finalDetail.project_status).toBe('SUBMITTED');
        expect(finalDetail.sample_status).toBe('SUBMITTED');
        expect(finalDetail.assembly_status).toBe('SUBMITTED');

        console.log('Full API-driven flow completed successfully!');
    });

    test('Filtering submissions by organism works', async () => {
        test.setTimeout(120000);

        const isHealthy = await checkEnaDepositionHealth();

        if (!isHealthy) {
            test.skip(true, 'ENA Deposition API is not available');
            return;
        }

        const timestamp = Date.now();

        // Submit two submissions with different organisms
        await submitToEna([
            {
                accession: `LOC_FILTER1_${timestamp}`,
                version: 1,
                organism: 'cchf',
                group_id: TEST_GROUP_ID,
                metadata: {
                    accessionVersion: `LOC_FILTER1_${timestamp}.1`,
                    groupId: TEST_GROUP_ID,
                    dataUseTerms: 'OPEN',
                },
                unaligned_nucleotide_sequences: { L: 'ATCG', M: 'GCTA', S: 'TACG' },
            },
            {
                accession: `LOC_FILTER2_${timestamp}`,
                version: 1,
                organism: 'ebola-zaire',
                group_id: TEST_GROUP_ID,
                metadata: {
                    accessionVersion: `LOC_FILTER2_${timestamp}.1`,
                    groupId: TEST_GROUP_ID,
                    dataUseTerms: 'OPEN',
                },
                unaligned_nucleotide_sequences: { main: 'ATCGATCG' },
            },
        ]);

        // Filter by organism
        const cchfSubmissions = await getEnaSubmissions({ organism: 'cchf' });
        expect(cchfSubmissions.items.every((s) => s.organism === 'cchf')).toBe(true);

        const ebolaSubmissions = await getEnaSubmissions({ organism: 'ebola-zaire' });
        expect(ebolaSubmissions.items.every((s) => s.organism === 'ebola-zaire')).toBe(true);

        console.log(
            `Filter test passed: ${cchfSubmissions.total} cchf, ${ebolaSubmissions.total} ebola`,
        );
    });

    test('Pagination works correctly', async () => {
        test.setTimeout(120000);

        const isHealthy = await checkEnaDepositionHealth();

        if (!isHealthy) {
            test.skip(true, 'ENA Deposition API is not available');
            return;
        }

        const timestamp = Date.now();

        // Submit 5 items
        const submissions: Array<{
            accession: string;
            version: number;
            organism: string;
            group_id: number;
            metadata: Record<string, unknown>;
            unaligned_nucleotide_sequences: Record<string, string | null>;
        }> = [];
        for (let i = 0; i < 5; i++) {
            submissions.push({
                accession: `LOC_PAGE${i}_${timestamp}`,
                version: 1,
                organism: 'cchf',
                group_id: TEST_GROUP_ID,
                metadata: {
                    accessionVersion: `LOC_PAGE${i}_${timestamp}.1`,
                    groupId: TEST_GROUP_ID,
                    dataUseTerms: 'OPEN',
                },
                unaligned_nucleotide_sequences: { L: 'ATCG', M: 'GCTA', S: 'TACG' },
            });
        }

        await submitToEna(submissions);

        // Get first page with size 2
        const page1 = await getEnaSubmissions({ page: 1, size: 2 });
        expect(page1.items.length).toBeLessThanOrEqual(2);
        expect(page1.items.length).toBeGreaterThan(0);
        expect(page1.page).toBe(1);
        expect(page1.size).toBe(2);
        expect(page1.total).toBeGreaterThanOrEqual(5);

        // Get second page - may have 1-2 items depending on timing
        const page2 = await getEnaSubmissions({ page: 2, size: 2 });
        expect(page2.items.length).toBeLessThanOrEqual(2);
        expect(page2.page).toBe(2);

        // Verify different items on each page (if both have items)
        if (page1.items.length > 0 && page2.items.length > 0) {
            const page1Accessions = new Set<string>(page1.items.map((s) => s.accession));
            const page2Accessions = new Set<string>(page2.items.map((s) => s.accession));
            const overlap = Array.from(page1Accessions).filter((a) => page2Accessions.has(a));
            expect(overlap.length).toBe(0);
        }

        console.log(
            `Pagination test passed: page1=${page1.items.length}, page2=${page2.items.length}`,
        );
    });

    test('External metadata is populated after successful submission', async () => {
        test.setTimeout(600000); // 10 minutes for full flow

        const isApiHealthy = await checkEnaDepositionHealth();
        const isMockEnaHealthy = await checkMockEnaHealth();

        if (!isApiHealthy || !isMockEnaHealthy) {
            test.skip(true, 'ENA Deposition API or Mock ENA is not available');
            return;
        }

        const timestamp = Date.now();
        const accession = `LOC_EXT_META${timestamp}`;

        // Submit via the API
        await submitToEna([
            {
                accession,
                version: 1,
                organism: 'cchf',
                group_id: TEST_GROUP_ID,
                metadata: {
                    accessionVersion: `${accession}.1`,
                    groupId: TEST_GROUP_ID,
                    dataUseTerms: 'OPEN',
                    submissionId: `ext_meta_test_${timestamp}`,
                    authors: 'Metadata, Test',
                    authorAffiliations: 'Test Institute',
                    geoLocCountry: 'Germany',
                    sampleCollectionDate: '2024-01-15',
                    hostNameScientific: 'Homo sapiens',
                    hostTaxonId: '9606',
                    specimenCollectorSampleId: `EXT-META-${timestamp}`,
                },
                unaligned_nucleotide_sequences: {
                    L: 'ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG',
                    M: 'GCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTA',
                    S: 'TACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACG',
                },
            },
        ]);

        // Wait for completion
        const finalDetail = await waitForSubmissionStatus(accession, 1, 'SENT_TO_LOCULUS', 540000);

        // Verify external metadata was populated
        expect(finalDetail.external_metadata).toBeDefined();
        expect(finalDetail.external_metadata).not.toBeNull();

        const extMeta = finalDetail.external_metadata as Record<string, string> | null;

        // Check for expected ENA accession fields
        // These are populated by the external metadata upload process
        if (extMeta?.bioprojectAccession) {
            expect(extMeta.bioprojectAccession).toMatch(/^PRJEB\d+$/);
            console.log(`Bioproject accession: ${extMeta.bioprojectAccession}`);
        }

        if (extMeta?.biosampleAccession) {
            expect(extMeta.biosampleAccession).toMatch(/^SAMEA\d+$/);
            console.log(`Biosample accession: ${extMeta.biosampleAccession}`);
        }

        if (extMeta?.gcaAccession) {
            expect(extMeta.gcaAccession).toMatch(/^GCA_\d+\.\d+$/);
            console.log(`GCA accession: ${extMeta.gcaAccession}`);
        }

        // Verify project/sample/assembly results are populated
        expect(finalDetail.project_result).toBeDefined();
        expect(finalDetail.sample_result).toBeDefined();
        expect(finalDetail.assembly_result).toBeDefined();

        console.log('External metadata verification completed successfully!');
    });
});
