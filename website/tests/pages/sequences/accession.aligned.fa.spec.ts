import { routes } from '../../../src/routes/routes.ts';
import { getAccessionVersionString } from '../../../src/utils/extractAccessionVersion.ts';
import { baseUrl, expect, test } from '../../e2e.fixture';
import { getTestSequences } from '../../util/testSequenceProvider.ts';

const alignedSequence = 'N' + 'A'.repeat(29902);

test.describe('The sequence.aligned.fa page', () => {
    test('can load and show aligned fasta file', async () => {
        const testSequences = getTestSequences();

        const url = `${baseUrl}${routes.sequenceEntryAlignedFastaPage(testSequences.testSequenceEntry)}`;
        const response = await fetch(url);
        const corsHeader = response.headers.get('Access-Control-Allow-Origin');
        expect(corsHeader).toBe('*');
        const content = await response.text();
        expect(content).toBe(`>${getAccessionVersionString(testSequences.testSequenceEntry)}\n${alignedSequence}\n`);
    });

    test('can download aligned fasta file', async () => {
        const testSequences = getTestSequences();

        const downloadUrl = `${baseUrl}${routes.sequenceEntryAlignedFastaPage(testSequences.testSequenceEntry, true)}`;
        const response = await fetch(downloadUrl);
        const corsHeader = response.headers.get('Access-Control-Allow-Origin');
        expect(corsHeader).toBe('*');
        const contentDisposition = response.headers.get('Content-Disposition');

        expect(contentDisposition).not.toBeNull();
        expect(contentDisposition).toContain('attachment');
        expect(contentDisposition).toContain(getAccessionVersionString(testSequences.testSequenceEntry));
    });
});
