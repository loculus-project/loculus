import { expect } from '@playwright/test';
import { test } from '../../fixtures/sequence.fixture';
import { SearchPage } from '../../pages/search.page';

test.describe('GA4GH DRS API endpoints', () => {
    test('returns valid service-info', async ({ page }) => {
        const response = await page.request.get('/ga4gh/drs/v1/service-info');

        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('application/json');

        const serviceInfo = await response.json();
        expect(serviceInfo.id).toBe('loculus-drs');
        expect(serviceInfo.name).toContain('Data Repository Service');
        expect(serviceInfo.type.group).toBe('org.ga4gh');
        expect(serviceInfo.type.artifact).toBe('drs');
        expect(serviceInfo.type.version).toBe('1.2.0');
    });

    test('returns object metadata for existing sequence', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        // Get the first accession from the returned search results
        const accessionLink = page.getByRole('link', { name: /LOC_/ }).first();
        await expect(accessionLink).toBeVisible();

        const accessionHref = await accessionLink.getAttribute('href');
        const accessionMatch = accessionHref.match(/\/seq\/(LOC_[^/]+)/);
        expect(accessionMatch).toBeTruthy();

        const accession = accessionMatch[1];

        // Test the DRS object endpoint
        const objectResponse = await page.request.get(`/ga4gh/drs/v1/objects/${accession}`);
        expect(objectResponse.status()).toBe(200);

        const objectData = await objectResponse.json();
        expect(objectData.id).toBe(accession);
        expect(objectData.mime_type).toBe('text/x-fasta');
        expect(objectData.access_methods.length).toBeGreaterThan(0);
        expect(objectData.access_methods[0].type).toBe('https');
        expect(objectData.access_methods[0].access_id).toBe('fasta');

        // Test the access URL endpoint
        const accessResponse = await page.request.get(
            `/ga4gh/drs/v1/objects/${accession}/access/fasta`,
        );
        expect(accessResponse.status()).toBe(200);

        const accessData = await accessResponse.json();
        expect(accessData.url).toContain(accession);
        expect(accessData.url).toContain('.fa');

        // Verify the FASTA URL is valid and returns sequence data
        const fastaResponse = await page.request.get(accessData.url);
        expect(fastaResponse.status()).toBe(200);

        const fastaContent = await fastaResponse.text();
        expect(fastaContent).toContain('>');
        expect(fastaContent.length).toBeGreaterThan(100);
    });

    test('returns 404 for non-existent object', async ({ page }) => {
        const response = await page.request.get('/ga4gh/drs/v1/objects/LOC_NONEXISTENT_123');
        expect(response.status()).toBe(404);

        const errorData = await response.json();
        expect(errorData.status_code).toBe(404);
        expect(errorData.msg).toContain('Object not found');
    });
});
