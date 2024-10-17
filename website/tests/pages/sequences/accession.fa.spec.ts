import { routes } from '../../../src/routes/routes.ts';
import { getAccessionVersionString } from '../../../src/utils/extractAccessionVersion.ts';
import { baseUrl, expect, test, testSequenceEntryData } from '../../e2e.fixture';
import { getTestSequences } from '../../util/testSequenceProvider.ts';

test.describe('The sequence.fa page', () => {
    test('can load and show fasta file', async () => {
        const testSequences = getTestSequences();

        const url = `${baseUrl}${routes.sequenceEntryFastaPage(testSequences.testSequenceEntry)}`;
        const response = await fetch(url);
        const content = await response.text();
        expect(content).toBe(
            `>${getAccessionVersionString(testSequences.testSequenceEntry)}\n${testSequenceEntryData.unaligned}\n`,
        );
    });

    test('can download fasta file', async () => {
        const testSequences = getTestSequences();

        const downloadUrl = `${baseUrl}${routes.sequenceEntryFastaPage(testSequences.testSequenceEntry, true)}`;
        const response = await fetch(downloadUrl);
        const contentDisposition = response.headers.get('Content-Disposition');

        expect(contentDisposition).not.toBeNull();
        expect(contentDisposition).toContain('attachment');
        expect(contentDisposition).toContain(getAccessionVersionString(testSequences.testSequenceEntry));
    });
});
