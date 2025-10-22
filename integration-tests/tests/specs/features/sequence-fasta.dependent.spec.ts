import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../pages/search.page';

test.describe('Sequence FASTA endpoint', () => {
    test('can load and show FASTA file with correct CORS headers', async ({ page, baseURL }) => {
        const searchPage = new SearchPage(page);

        // Navigate to Ebola Sudan search page where sequences are available
        await searchPage.ebolaSudan();

        // Wait for a sequence to appear and get its accession
        const accessionVersion = await searchPage.waitForLoculusId();

        expect(accessionVersion).toBeTruthy();

        // Fetch the FASTA endpoint
        const fastaUrl = `${baseURL}/seq/${accessionVersion}.fa`;
        const response = await fetch(fastaUrl);

        // Verify CORS header
        const corsHeader = response.headers.get('Access-Control-Allow-Origin');
        expect(corsHeader).toBe('*');

        // Verify content is valid FASTA format
        const content = await response.text();
        expect(content).toMatch(/^>/); // FASTA starts with >
        expect(content).toContain(accessionVersion); // Contains accession in header
        expect(content.split('\n').length).toBeGreaterThan(1); // Has multiple lines

        // Verify response is successful
        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
    });

    test('can download FASTA file with correct content-disposition headers', async ({
        page,
        baseURL,
    }) => {
        const searchPage = new SearchPage(page);

        // Navigate to Ebola Sudan search page where sequences are available
        await searchPage.ebolaSudan();

        // Wait for a sequence to appear and get its accession
        const accessionVersion = await searchPage.waitForLoculusId();

        expect(accessionVersion).toBeTruthy();

        // Fetch the FASTA endpoint with download parameter
        const downloadUrl = `${baseURL}/seq/${accessionVersion}.fa?download=true`;
        const response = await fetch(downloadUrl);

        // Verify CORS header is still present
        const corsHeader = response.headers.get('Access-Control-Allow-Origin');
        expect(corsHeader).toBe('*');

        // Verify Content-Disposition header for download
        const contentDisposition = response.headers.get('Content-Disposition');
        expect(contentDisposition).not.toBeNull();
        expect(contentDisposition).toContain('attachment');
        expect(contentDisposition).toContain(accessionVersion);

        // Verify response is successful
        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
    });

    test('can access FASTA file from sequence details page', async ({ page, baseURL }) => {
        const searchPage = new SearchPage(page);

        // Navigate to Ebola Sudan search page
        await searchPage.ebolaSudan();

        // Wait for a sequence to appear and get its accession
        const accessionVersion = await searchPage.waitForLoculusId();
        expect(accessionVersion).toBeTruthy();

        // Navigate directly to the sequence details page
        await page.goto(`/seq/${accessionVersion}`);
        await expect(page.getByRole('heading', { name: accessionVersion })).toBeVisible();

        // Verify we can access the FASTA endpoint from this page
        const fastaUrl = `${baseURL}/seq/${accessionVersion}.fa`;
        const response = await fetch(fastaUrl);

        expect(response.ok).toBe(true);
        const content = await response.text();
        expect(content).toMatch(/^>/);
        expect(content).toContain(accessionVersion);
    });
});
