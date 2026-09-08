import { describe, expect, it, vi } from 'vitest';

import { getReferenceGenbank, referenceMatchesGenbank, unannotatedGenbank } from './referenceGenbank';

const reference = { name: 'Synthetic reference', sequence: 'ACGTACGT' };

describe('reference GenBank', () => {
    it('creates a nucleotide-only record when no accession is configured', async () => {
        const load = vi.fn();
        const result = await getReferenceGenbank(reference, load);
        expect(load).not.toHaveBeenCalled();
        expect(result.annotationNotice).toBeDefined();
        expect(referenceMatchesGenbank(reference.sequence, result.genbankString)).toBe(true);
    });

    it('uses annotations only when the reference bases match exactly', async () => {
        const genbank = unannotatedGenbank(reference);
        const load = vi.fn().mockResolvedValue(genbank);
        expect(await getReferenceGenbank({ ...reference, insdcAccessionFull: 'TEST.1' }, load)).toEqual({
            genbankString: genbank,
        });
        expect(load).toHaveBeenCalledWith('TEST.1');
        expect(
            (await getReferenceGenbank({ ...reference, sequence: 'AAAAAAAA', insdcAccessionFull: 'TEST.1' }, load))
                .annotationNotice,
        ).toBeDefined();
    });

    it('falls back when the annotation service is unavailable', async () => {
        const result = await getReferenceGenbank({ ...reference, insdcAccessionFull: 'TEST.1' }, () =>
            Promise.resolve(undefined),
        );
        expect(result.annotationNotice).toBeDefined();
        expect(referenceMatchesGenbank(reference.sequence, result.genbankString)).toBe(true);
        expect(referenceMatchesGenbank(reference.sequence, 'not a GenBank record')).toBe(false);
    });
});
