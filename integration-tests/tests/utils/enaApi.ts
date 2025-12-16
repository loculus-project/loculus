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
