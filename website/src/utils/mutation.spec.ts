import { describe, it, expect } from 'vitest';

import {
    parseMutationString,
    parseMutationsString,
    serializeMutationQueries,
    removeMutationQueries,
    intoMutationSearchParams,
} from './mutation';
import { type ReferenceGenomesSequenceNames, SINGLE_REFERENCE } from '../types/referencesGenomes';

describe('mutation', () => {
    describe('single segment', () => {
        const mockReferenceGenomes: ReferenceGenomesSequenceNames = {
            [SINGLE_REFERENCE]: {
                nucleotideSequences: ['main'],
                genes: ['GENE1', 'GENE2'],
                insdcAccessionFull: [],
            },
        };

        it('parses a valid mutation string', () => {
            const result = parseMutationString('GENE1:A23T', mockReferenceGenomes);
            expect(result).toEqual({
                baseType: 'aminoAcid',
                mutationType: 'substitutionOrDeletion',
                text: 'GENE1:A23T',
            });
        });

        it.each(['INVALID:MUTATION', 'AA-10T', 'INS_', 'GENE:', ':::', 'ins_A:23:T', 'ins_23:A:T', 'INS_4:G:T'])(
            'returns undefined for invalid mutation string %s',
            (input) => {
                const result = parseMutationString(input, mockReferenceGenomes);
                expect(result).toBeUndefined();
            },
        );
    });

    describe('multi-segment', () => {
        const mockReferenceGenomes: ReferenceGenomesSequenceNames = {
            [SINGLE_REFERENCE]: {
                nucleotideSequences: ['SEQ1', 'SEQ2'],
                genes: ['GENE1', 'GENE2'],
                insdcAccessionFull: [],
            },
        };

        it('parses a valid mutation string', () => {
            const result = parseMutationString('GENE1:A23T', mockReferenceGenomes);
            expect(result).toEqual({
                baseType: 'aminoAcid',
                mutationType: 'substitutionOrDeletion',
                text: 'GENE1:A23T',
            });
        });

        it.each([
            'INVALID:MUTATION',
            '12345',
            'AA-10T',
            'INS_',
            'GENE:',
            ':::',
            'ins_A:23:T',
            'ins_23:A:T',
            'INS_4:G:T',
        ])('returns undefined for invalid mutation string %s', (input) => {
            const result = parseMutationString(input, mockReferenceGenomes);
            expect(result).toBeUndefined();
        });

        it('parses a comma-separated mutation string', () => {
            const result = parseMutationsString('GENE1:A23T, SEQ1:123C', mockReferenceGenomes);
            expect(result).toEqual([
                { baseType: 'aminoAcid', mutationType: 'substitutionOrDeletion', text: 'GENE1:A23T' },
                { baseType: 'nucleotide', mutationType: 'substitutionOrDeletion', text: 'SEQ1:123C' },
            ]);
        });

        it('serializes mutation queries back to string', () => {
            const serialized = serializeMutationQueries([
                { baseType: 'aminoAcid', mutationType: 'substitutionOrDeletion', text: 'GENE1:A23T' },
                { baseType: 'nucleotide', mutationType: 'substitutionOrDeletion', text: 'SEQ1:123C' },
            ]);
            expect(serialized).toBe('GENE1:A23T, SEQ1:123C');
        });

        it('removes specified mutation queries', () => {
            const result = removeMutationQueries(
                'GENE1:A23T, SEQ1:123C',
                mockReferenceGenomes,
                'aminoAcid',
                'substitutionOrDeletion',
            );
            expect(result).toBe('SEQ1:123C');
        });

        it('converts mutations to search params', () => {
            const params = intoMutationSearchParams('GENE1:A23T, SEQ1:123C, INS_SEQ1:100:G', mockReferenceGenomes);
            expect(params).toEqual({
                nucleotideMutations: ['SEQ1:123C'],
                aminoAcidMutations: ['GENE1:A23T'],
                nucleotideInsertions: ['INS_SEQ1:100:G'],
                aminoAcidInsertions: [],
            });
        });
    });
});
