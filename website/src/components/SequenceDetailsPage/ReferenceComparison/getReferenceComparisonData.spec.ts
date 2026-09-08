import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { getReferenceComparisonData, comparisonInsertions, comparisonReference } from './getReferenceComparisonData';
import type { LapisClient } from '../../../services/lapisClient';
import type { InsertionCount } from '../../../types/lapis';

const references = [
    {
        name: 'main',
        references: [
            { name: 'ref1', sequence: 'ACGTACGT' },
            { name: 'ref2', sequence: 'AAAAAAAA' },
        ],
    },
];
const insertion = (sequenceName: string | null): InsertionCount => ({
    sequenceName,
    insertion: 'ins_4:GAC',
    count: 1,
    position: 4,
    insertedSymbols: 'GAC',
});

describe('reference comparison data', () => {
    it('requires an assigned reference when several exist', () => {
        expect(comparisonReference(references, undefined, 'main')).toBeUndefined();
        expect(comparisonReference(references, { main: 'ref2' }, 'main')?.name).toBe('ref2');
        expect(comparisonReference(references, { main: 'missing' }, 'main')).toBeUndefined();
        expect(comparisonReference([references[0]], { main: null }, 'main')).toBeUndefined();
    });

    it('keeps insertion boundaries and filters other segments and references', () => {
        const insertions = [insertion('ref1'), insertion('ref2'), insertion(null)];
        expect(comparisonInsertions(insertions, 'ref1', true)).toEqual([{ position: 4, sequence: 'GAC' }]);
        expect(comparisonInsertions([insertion(null)], 'main', false)).toEqual([{ position: 4, sequence: 'GAC' }]);
    });

    it('passes through supplied gaps and Ns without realigning', async () => {
        const call = vi.fn().mockResolvedValue(ok('>TEST1.1\nAC--NCGT\n'));
        const getSequenceInsertions = vi.fn().mockResolvedValue(ok({ data: [insertion('ref1'), insertion('ref2')] }));
        const client = { call, getSequenceInsertions } as unknown as LapisClient;
        const data = await getReferenceComparisonData({
            accessionVersion: 'TEST1.1',
            segmentName: 'main',
            references,
            selections: { main: 'ref1' },
            primaryKey: 'id',
            client,
        });
        expect(call).toHaveBeenCalledWith(
            'alignedNucleotideSequencesMultiSegment',
            { id: 'TEST1.1', dataFormat: 'FASTA' },
            { params: { segment: 'ref1' } },
        );
        expect(data.alignedSequence).toEqual({
            name: 'TEST1.1',
            sequence: 'AC--NCGT',
            insertions: [{ position: 4, sequence: 'GAC' }],
        });
        call.mockResolvedValue(ok('>TEST1.1\nACGT\n'));
        await expect(
            getReferenceComparisonData({
                accessionVersion: 'TEST1.1',
                segmentName: 'main',
                references,
                selections: { main: 'ref1' },
                primaryKey: 'id',
                client,
            }),
        ).rejects.toThrow('An alignment matching this reference is unavailable.');
    });
});
