import { getAccessionVersionString } from '../../src/utils/extractAccessionVersion.ts';
import { baseUrl, dummyOrganism, expect, test } from '../e2e.fixture';
import { getTestSequences } from '../util/testSequenceProvider.ts';

test.describe('The sequences endpoint', () => {
    const testSequenceEntry = getTestSequences().testSequenceEntry;

    test('should return pipe-separated header fields', async ({ request }) => {
        const query = new URLSearchParams([
            ['headerFields', 'accessionVersion'],
            ['headerFields', 'country'],
            ['headerFields', 'pangoLineage'],
            ['downloadFileBasename', 'my-sequences'],
        ]);

        const response = await request.get(`${baseUrl}/${dummyOrganism.key}/api/sequences?${query}`);

        expect(response.status()).toBe(200);
        expect(response.headers()).toHaveProperty('content-disposition', 'attachment; filename="my-sequences.fasta"');
        expect(await response.text()).toContain(
            `>${getAccessionVersionString(testSequenceEntry)}|Switzerland|A.1.1\nAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
        );
    });
});
