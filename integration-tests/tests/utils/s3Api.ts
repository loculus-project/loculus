/**
 * Utility functions for accessing publicly readable S3/MinIO files in integration tests.
 * The ena-deposition directory is configured to be publicly accessible.
 */

/* eslint-disable no-restricted-globals */

export interface S3Object {
    key: string;
    size: number;
    lastModified: string;
}

/**
 * Get the MinIO endpoint URL for the test environment.
 */
function getMinioEndpoint(): string {
    const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
    const host = new URL(baseUrl).hostname;
    // MinIO runs on port 30084 as a NodePort service
    return `http://${host}:30084`;
}

/**
 * Get the S3 bucket name (default for dev environment).
 */
function getBucketName(): string {
    return process.env.S3_BUCKET || 'loculus-preview-private';
}

/**
 * List objects in the ena-deposition directory using S3 ListBucket API.
 * Returns files matching the prefix.
 */
export async function listEnaDepositionFiles(): Promise<S3Object[]> {
    const endpoint = getMinioEndpoint();
    const bucket = getBucketName();
    const url = `${endpoint}/${bucket}?list-type=2&prefix=ena-deposition/`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to list S3 objects: ${response.status} ${response.statusText}`);
            return [];
        }

        const xml = await response.text();

        // Parse XML response - extract Key, Size, LastModified
        const objects: S3Object[] = [];
        const keys: string[] = [];
        const sizes: number[] = [];
        const dates: string[] = [];

        let match: RegExpExecArray | null;
        const keyRegex = /<Key>([^<]+)<\/Key>/g;
        const sizeRegex = /<Size>([^<]+)<\/Size>/g;
        const dateRegex = /<LastModified>([^<]+)<\/LastModified>/g;

        while ((match = keyRegex.exec(xml)) !== null) {
            keys.push(match[1]);
        }
        while ((match = sizeRegex.exec(xml)) !== null) {
            sizes.push(parseInt(match[1], 10));
        }
        while ((match = dateRegex.exec(xml)) !== null) {
            dates.push(match[1]);
        }

        for (let i = 0; i < keys.length; i++) {
            // Extract just the filename from the full key
            const key = keys[i].replace('ena-deposition/', '');
            if (key) {
                objects.push({
                    key,
                    size: sizes[i] || 0,
                    lastModified: dates[i] || '',
                });
            }
        }

        return objects;
    } catch (error) {
        console.error('Error listing S3 objects:', error);
        return [];
    }
}

/**
 * Get the content of a file from the ena-deposition directory.
 */
export async function getEnaDepositionFile(filename: string): Promise<string | null> {
    const endpoint = getMinioEndpoint();
    const bucket = getBucketName();
    const url = `${endpoint}/${bucket}/ena-deposition/${filename}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to get S3 object: ${response.status} ${response.statusText}`);
            return null;
        }
        return await response.text();
    } catch (error) {
        console.error(`Error fetching S3 object ${filename}:`, error);
        return null;
    }
}

/**
 * Wait for a file matching the pattern to appear in the ena-deposition directory.
 */
export async function waitForEnaDepositionFile(
    filenamePattern: RegExp,
    timeoutMs: number = 120000,
): Promise<S3Object | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        const files = await listEnaDepositionFiles();
        const match = files.find((f) => filenamePattern.test(f.key));
        if (match) {
            return match;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    return null;
}

/**
 * Check if the ena-deposition directory has any files.
 */
export async function hasEnaDepositionFiles(): Promise<boolean> {
    const files = await listEnaDepositionFiles();
    return files.length > 0;
}

/**
 * Clear/delete files in the ena-deposition directory.
 * Note: This is a no-op since we can't delete from public bucket.
 * The cronjob should produce unique filenames based on timestamp.
 */
export function clearEnaDepositionFiles(): void {
    // No-op - files in S3 are not deleted between tests
    // The cronjob uses timestamps in filenames so there shouldn't be conflicts
    console.log('clearEnaDepositionFiles: no-op (public bucket cannot be modified)');
}
