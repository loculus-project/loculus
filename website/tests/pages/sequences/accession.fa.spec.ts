import { routes } from '../../../src/routes.ts';
import { baseUrl, dummyOrganism, expect, test, testSequenceEntry } from '../../e2e.fixture';

test.describe('The sequence.fa page', () => {
    test('can load and show fasta file', async () => {
        const url = `${baseUrl}${routes.sequencesFastaPage(dummyOrganism.key, testSequenceEntry)}`;
        const content = await (await fetch(url)).text();
        expect(content).toBe(`>${testSequenceEntry.name}\n${testSequenceEntry.unaligned}\n`);
    });
});
