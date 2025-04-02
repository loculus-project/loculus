import { routes } from '../../../../src/routes/routes.ts';
import { getAccessionVersionString } from '../../../../src/utils/extractAccessionVersion.ts';
import { baseUrl, expect, test, testSequenceEntryData } from '../../../e2e.fixture';
import { getTestSequences } from '../../../util/testSequenceProvider.ts';

test.describe('The GA4GH DRS API', () => {
    test('service-info endpoint returns correct information', async () => {
        const url = `${baseUrl}/ga4gh/drs/v1/service-info`;
        const response = await fetch(url);
        
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/json');
        
        const data = await response.json();
        expect(data.id).toBe('loculus-drs');
        expect(data.name).toContain('Data Repository Service');
        expect(data.type.group).toBe('org.ga4gh');
        expect(data.type.artifact).toBe('drs');
    });

    test('objects endpoint returns correct information for a valid sequence', async () => {
        const testSequences = getTestSequences();
        const accessionVersion = getAccessionVersionString(testSequences.testSequenceEntry);
        
        const url = `${baseUrl}/ga4gh/drs/v1/objects/${accessionVersion}`;
        const response = await fetch(url);
        
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/json');
        
        const data = await response.json();
        expect(data.id).toBe(accessionVersion);
        expect(data.mime_type).toBe('text/x-fasta');
        expect(data.access_methods).toHaveLength(1);
        expect(data.access_methods[0].access_id).toBe('fasta');
    });

    test('objects endpoint returns 404 for an invalid sequence', async () => {
        const url = `${baseUrl}/ga4gh/drs/v1/objects/INVALID-SEQUENCE.1`;
        const response = await fetch(url);
        
        expect(response.status).toBe(404);
    });

    test('access endpoint returns correct URL for a valid sequence', async () => {
        const testSequences = getTestSequences();
        const accessionVersion = getAccessionVersionString(testSequences.testSequenceEntry);
        
        const url = `${baseUrl}/ga4gh/drs/v1/objects/${accessionVersion}/access/fasta`;
        const response = await fetch(url);
        
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/json');
        
        const data = await response.json();
        expect(data.url).toContain(accessionVersion);
        
        // Verify the URL actually works
        const accessResponse = await fetch(data.url);
        expect(accessResponse.status).toBe(200);
        const content = await accessResponse.text();
        expect(content).toContain(testSequenceEntryData.unaligned);
    });

    test('access endpoint returns 400 for an unsupported access type', async () => {
        const testSequences = getTestSequences();
        const accessionVersion = getAccessionVersionString(testSequences.testSequenceEntry);
        
        const url = `${baseUrl}/ga4gh/drs/v1/objects/${accessionVersion}/access/unsupported`;
        const response = await fetch(url);
        
        expect(response.status).toBe(400);
    });

    test('access endpoint returns 404 for an invalid sequence', async () => {
        const url = `${baseUrl}/ga4gh/drs/v1/objects/INVALID-SEQUENCE.1/access/fasta`;
        const response = await fetch(url);
        
        expect(response.status).toBe(404);
    });
});