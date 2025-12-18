/**
 * Utility functions for interacting with the ENA submission system in tests.
 *
 * These utilities use native fetch() instead of Playwright's request API because:
 * 1. They're used for admin/health check endpoints, not user-facing pages
 * 2. They need to work outside of a Playwright page context (e.g., in beforeAll hooks)
 * 3. The mock ENA service uses self-signed certs that need special handling
 */

/* eslint-disable no-restricted-globals */
import https from 'https';

/**
 * Make an HTTPS request that ignores SSL certificate errors.
 * This is necessary for the mock ENA service which uses self-signed certificates.
 */
async function fetchWithInsecureSSL(
    url: string,
    options: { method?: string; headers?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<unknown> }> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const reqOptions: https.RequestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {},
            rejectUnauthorized: false, // Ignore SSL certificate errors
        };

        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({
                    ok:
                        res.statusCode !== undefined &&
                        res.statusCode >= 200 &&
                        res.statusCode < 300,
                    status: res.statusCode || 0,
                    statusText: res.statusMessage || '',
                    json: () => Promise.resolve(JSON.parse(data)),
                });
            });
        });

        req.on('error', reject);
        req.end();
    });
}

export interface MockEnaProject {
    alias: string;
    accession: string;
    submission_accession: string;
    created_at: string;
}

export interface MockEnaSample {
    alias: string;
    accession: string;
    biosample_accession: string;
    submission_accession: string;
    created_at: string;
}

export interface MockEnaAssembly {
    erz_accession: string;
    gca_accession: string | null;
    insdc_accessions: string | null;
    status: string;
    created_at: string;
}

export interface MockEnaState {
    projects: MockEnaProject[];
    samples: MockEnaSample[];
    assemblies: MockEnaAssembly[];
}

export interface EnaSubmittedResponse {
    status: string;
    insdcAccessions: string[];
    biosampleAccessions: string[];
}

/**
 * Get the base URL for the mock ENA service.
 * In k3d deployments, this is accessible via the mock-ena-service NodePort.
 */
function getMockEnaBaseUrl(): string {
    const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
    const host = new URL(baseUrl).hostname;
    // Mock ENA runs on port 30443 as a NodePort service with HTTPS
    return `https://${host}:30443`;
}

/**
 * Get the base URL for the ENA deposition pod API.
 * This is accessible via the ena-submission-service NodePort.
 */
function getEnaDepositionBaseUrl(): string {
    const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
    const host = new URL(baseUrl).hostname;
    // ENA deposition API runs on port 30050 as a NodePort service
    return `http://${host}:30050`;
}

/**
 * Query the mock ENA admin state endpoint to get all submitted items.
 * This is useful for verifying that submissions were made correctly.
 */
export async function getMockEnaState(): Promise<MockEnaState> {
    const url = `${getMockEnaBaseUrl()}/admin/state`;

    const response = await fetchWithInsecureSSL(url, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to get mock ENA state: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<MockEnaState>;
}

/**
 * Reset the mock ENA state.
 * Use this at the beginning of tests to ensure a clean state.
 */
export async function resetMockEnaState(): Promise<void> {
    const url = `${getMockEnaBaseUrl()}/admin/reset`;

    const response = await fetchWithInsecureSSL(url, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(
            `Failed to reset mock ENA state: ${response.status} ${response.statusText}`,
        );
    }
}

/**
 * Query the ENA deposition pod API for submitted accessions.
 * This returns INSDC and biosample accessions that have been submitted.
 */
export async function getEnaSubmittedAccessions(): Promise<EnaSubmittedResponse> {
    const url = `${getEnaDepositionBaseUrl()}/submitted`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(
            `Failed to get ENA submitted accessions: ${response.status} ${response.statusText}`,
        );
    }

    return response.json() as Promise<EnaSubmittedResponse>;
}

/**
 * Check the ENA deposition pod health.
 */
export async function checkEnaDepositionHealth(): Promise<boolean> {
    try {
        const url = `${getEnaDepositionBaseUrl()}/`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Check the mock ENA service health.
 */
export async function checkMockEnaHealth(): Promise<boolean> {
    try {
        const url = `${getMockEnaBaseUrl()}/`;
        const response = await fetchWithInsecureSSL(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Wait for a condition to be true, polling at the specified interval.
 */
export async function waitFor<T>(
    condition: () => Promise<T | undefined | null | false>,
    options: {
        timeout?: number;
        interval?: number;
        description?: string;
    } = {},
): Promise<T> {
    const { timeout = 60000, interval = 2000, description = 'condition' } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        try {
            const result = await condition();
            if (result) {
                return result;
            }
        } catch {
            // Continue polling
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error(`Timeout waiting for ${description} after ${timeout}ms`);
}

/**
 * Wait for at least one project to appear in the mock ENA state.
 */
export async function waitForMockEnaProject(timeout: number = 120000): Promise<MockEnaProject> {
    return waitFor(
        async () => {
            const state = await getMockEnaState();
            return state.projects.length > 0 ? state.projects[0] : undefined;
        },
        { timeout, description: 'project in mock ENA' },
    );
}

/**
 * Wait for a specific number of samples to appear in the mock ENA state.
 */
export async function waitForMockEnaSamples(
    expectedCount: number,
    timeout: number = 180000,
): Promise<MockEnaSample[]> {
    return waitFor(
        async () => {
            const state = await getMockEnaState();
            if (state.samples.length >= expectedCount) {
                return state.samples;
            }
            return undefined;
        },
        { timeout, description: `${expectedCount} samples in mock ENA` },
    );
}

/**
 * Wait for ENA submissions to include at least the expected number of biosample accessions.
 */
export async function waitForEnaBiosampleAccessions(
    expectedCount: number,
    timeout: number = 180000,
): Promise<EnaSubmittedResponse> {
    return waitFor(
        async () => {
            const response = await getEnaSubmittedAccessions();
            if (response.biosampleAccessions.length >= expectedCount) {
                return response;
            }
            return undefined;
        },
        { timeout, description: `${expectedCount} biosample accessions in ENA deposition` },
    );
}

/**
 * Wait for a specific number of assemblies to appear in the mock ENA state.
 */
export async function waitForMockEnaAssemblies(
    expectedCount: number,
    timeout: number = 240000,
): Promise<MockEnaAssembly[]> {
    return waitFor(
        async () => {
            const state = await getMockEnaState();
            if (state.assemblies.length >= expectedCount) {
                return state.assemblies;
            }
            return undefined;
        },
        { timeout, description: `${expectedCount} assemblies in mock ENA` },
    );
}

/**
 * Wait for ENA submissions to include at least the expected number of INSDC accessions.
 */
export async function waitForEnaInsdcAccessions(
    expectedCount: number,
    timeout: number = 240000,
): Promise<EnaSubmittedResponse> {
    return waitFor(
        async () => {
            const response = await getEnaSubmittedAccessions();
            if (response.insdcAccessions.length >= expectedCount) {
                return response;
            }
            return undefined;
        },
        { timeout, description: `${expectedCount} INSDC accessions in ENA deposition` },
    );
}

/**
 * Wait for a specific assembly ERZ accession to have a GCA accession assigned.
 */
export async function waitForAssemblyWithGca(
    erzAccession: string,
    timeout: number = 240000,
): Promise<MockEnaAssembly> {
    return waitFor(
        async () => {
            const state = await getMockEnaState();
            const assembly = state.assemblies.find(
                (a) => a.erz_accession === erzAccession && a.gca_accession !== null,
            );
            return assembly;
        },
        { timeout, description: `assembly ${erzAccession} with GCA accession` },
    );
}

// ============================================================================
// ENA Deposition API Client Functions
// ============================================================================

export interface EnaSubmissionSummary {
    accession: string;
    version: number;
    organism: string;
    group_id: number;
    status_all: string;
    started_at: string;
    finished_at: string | null;
    has_errors: boolean;
    error_count: number;
}

export interface PaginatedSubmissions {
    items: EnaSubmissionSummary[];
    total: number;
    page: number;
    size: number;
    pages: number;
}

export interface EnaSubmissionDetail {
    accession: string;
    version: number;
    organism: string;
    group_id: number;
    status_all: string;
    metadata: Record<string, unknown>;
    unaligned_nucleotide_sequences: Record<string, string | null>;
    errors: string[] | null;
    warnings: string[] | null;
    started_at: string;
    finished_at: string | null;
    external_metadata: Record<string, unknown> | null;
    project_status: string | null;
    sample_status: string | null;
    assembly_status: string | null;
    project_result: Record<string, unknown> | null;
    sample_result: Record<string, unknown> | null;
    assembly_result: Record<string, unknown> | null;
}

export interface EnaPreviewItem {
    accession: string;
    version: number;
    organism: string;
    group_id: number;
    metadata: Record<string, unknown>;
    unaligned_nucleotide_sequences: Record<string, string | null>;
    validation_errors: string[];
    validation_warnings: string[];
}

export interface EnaPreviewResponse {
    previews: EnaPreviewItem[];
}

export interface EnaSubmitResponse {
    submitted: string[];
    errors: Array<{ accession: string; version: number; message: string }>;
}

export interface EnaErrorItem {
    accession: string;
    version: number;
    organism: string;
    group_id: number;
    table: string;
    error_messages: string[];
    status: string;
    started_at: string;
    can_retry: boolean;
}

export interface PaginatedErrors {
    items: EnaErrorItem[];
    total: number;
    page: number;
    size: number;
    pages: number;
}

export interface EnaActionResponse {
    success: boolean;
    message: string;
}

export interface EnaHealthResponse {
    status: string;
    message: string;
}

/**
 * Get the ENA deposition API health status.
 */
export async function getEnaDepositionApiHealth(): Promise<EnaHealthResponse> {
    const url = `${getEnaDepositionBaseUrl()}/api/health`;
    const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
        throw new Error(`Failed to get ENA deposition API health: ${response.status}`);
    }

    return response.json() as Promise<EnaHealthResponse>;
}

/**
 * Get submissions from the ENA deposition API.
 */
export async function getEnaSubmissions(params?: {
    status?: string;
    organism?: string;
    group_id?: number;
    page?: number;
    size?: number;
}): Promise<PaginatedSubmissions> {
    const url = new URL(`${getEnaDepositionBaseUrl()}/api/submissions`);
    if (params) {
        if (params.status) url.searchParams.set('status', params.status);
        if (params.organism) url.searchParams.set('organism', params.organism);
        if (params.group_id !== undefined)
            url.searchParams.set('group_id', params.group_id.toString());
        if (params.page !== undefined) url.searchParams.set('page', params.page.toString());
        if (params.size !== undefined) url.searchParams.set('size', params.size.toString());
    }

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
        throw new Error(`Failed to get ENA submissions: ${response.status}`);
    }

    return response.json() as Promise<PaginatedSubmissions>;
}

/**
 * Get a single submission detail from the ENA deposition API.
 */
export async function getEnaSubmissionDetail(
    accession: string,
    version: number,
): Promise<EnaSubmissionDetail> {
    const url = `${getEnaDepositionBaseUrl()}/api/submissions/${accession}/${version}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
        throw new Error(`Failed to get ENA submission detail: ${response.status}`);
    }

    return response.json() as Promise<EnaSubmissionDetail>;
}

/**
 * Generate a preview of what will be submitted to ENA.
 */
export async function generateEnaPreview(accessions: string[]): Promise<EnaPreviewResponse> {
    const url = `${getEnaDepositionBaseUrl()}/api/submissions/preview`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessions }),
    });

    if (!response.ok) {
        throw new Error(`Failed to generate ENA preview: ${response.status}`);
    }

    return response.json() as Promise<EnaPreviewResponse>;
}

/**
 * Submit sequences to ENA via the deposition API.
 */
export async function submitToEna(
    submissions: Array<{
        accession: string;
        version: number;
        organism: string;
        group_id: number;
        metadata: Record<string, unknown>;
        unaligned_nucleotide_sequences: Record<string, string | null>;
    }>,
): Promise<EnaSubmitResponse> {
    const url = `${getEnaDepositionBaseUrl()}/api/submissions/submit`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ submissions }),
    });

    if (!response.ok) {
        throw new Error(`Failed to submit to ENA: ${response.status}`);
    }

    return response.json() as Promise<EnaSubmitResponse>;
}

/**
 * Get errors from the ENA deposition API.
 */
export async function getEnaErrors(params?: {
    table?: string;
    organism?: string;
    group_id?: number;
    page?: number;
    size?: number;
}): Promise<PaginatedErrors> {
    const url = new URL(`${getEnaDepositionBaseUrl()}/api/errors`);
    if (params) {
        if (params.table) url.searchParams.set('table', params.table);
        if (params.organism) url.searchParams.set('organism', params.organism);
        if (params.group_id !== undefined)
            url.searchParams.set('group_id', params.group_id.toString());
        if (params.page !== undefined) url.searchParams.set('page', params.page.toString());
        if (params.size !== undefined) url.searchParams.set('size', params.size.toString());
    }

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
        throw new Error(`Failed to get ENA errors: ${response.status}`);
    }

    return response.json() as Promise<PaginatedErrors>;
}

/**
 * Retry a failed ENA submission.
 */
export async function retryEnaSubmission(
    accession: string,
    version: number,
    editedMetadata?: Record<string, unknown>,
): Promise<EnaActionResponse> {
    const url = `${getEnaDepositionBaseUrl()}/api/errors/${accession}/${version}/retry`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: editedMetadata ? JSON.stringify({ edited_metadata: editedMetadata }) : '{}',
    });

    if (!response.ok) {
        throw new Error(`Failed to retry ENA submission: ${response.status}`);
    }

    return response.json() as Promise<EnaActionResponse>;
}

/**
 * Wait for a submission to reach a specific status.
 */
export async function waitForSubmissionStatus(
    accession: string,
    version: number,
    expectedStatus: string,
    timeout: number = 240000,
): Promise<EnaSubmissionDetail> {
    return waitFor(
        async () => {
            try {
                const detail = await getEnaSubmissionDetail(accession, version);
                if (detail.status_all === expectedStatus) {
                    return detail;
                }
                return undefined;
            } catch {
                return undefined;
            }
        },
        {
            timeout,
            description: `submission ${accession}.${version} to reach status ${expectedStatus}`,
        },
    );
}
