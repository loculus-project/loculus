import { routes } from '../../../src/routes.ts';
import { baseUrl, dummyOrganism, expect, test, testSequenceEntry } from '../../e2e.fixture';

test.describe('The sequence.fa page', () => {
    test('can load and show fasta file', async () => {
        const url = `${baseUrl}${routes.sequencesFastaPage(dummyOrganism.key, testSequenceEntry)}`;
        const response = await fetch(url);
        const content = await response.text();
        expect(content).toBe(`>${testSequenceEntry.name}\n${testSequenceEntry.unaligned}\n`);
    });

    test('can download fasta file', async () => {
        const downloadUrl = `${baseUrl}${routes.sequencesFastaPage(dummyOrganism.key, testSequenceEntry, true)}`;
        const response = await fetch(downloadUrl);
        const contentDisposition = response.headers.get('Content-Disposition');

        expect(contentDisposition).not.toBeNull();
        expect(contentDisposition).toContain('attachment');
        expect(contentDisposition).toContain(testSequenceEntry.name);
    });
});
