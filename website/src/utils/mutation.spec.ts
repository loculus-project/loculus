import { describe, it, expect } from 'vitest';

import {
    parseMutationString,
    parseMutationsString,
    serializeMutationQueries,
    removeMutationQueries,
    intoMutationSearchParams,
} from './mutation';
import { type ReferenceGenomesLightweightSchema, SINGLE_REFERENCE } from '../types/referencesGenomes';

describe('mutation', () => {
    describe('single segment', () => {
        const mockLightweightSchema: ReferenceGenomesLightweightSchema = {
            [SINGLE_REFERENCE]: {
                nucleotideSegmentNames: ['main'],
                geneNames: ['GENE1', 'GENE2'],
                insdcAccessionFull: [],
            },
        };

        it('parses a valid mutation string', () => {
            const result = parseMutationString('GENE1:A23T', mockLightweightSchema);
            expect(result).toEqual({
                baseType: 'aminoAcid',
                mutationType: 'substitutionOrDeletion',
                text: 'GENE1:A23T',
            });
        });

        it('parses a valid mutation string with "."', () => {
            const result = parseMutationString('A23.', mockLightweightSchema);
            expect(result).toEqual({
                baseType: 'nucleotide',
                mutationType: 'substitutionOrDeletion',
                text: 'A23.',
            });
        });

        it.each([
            'INVALID:MUTATION',
            'AA-10T',
            '123\\',
            'INS_',
            'GENE:',
            ':::',
            'ins_A:23:T',
            'ins_23:A:T',
            'INS_4:G:T',
        ])('returns undefined for invalid mutation string %s', (input) => {
            const result = parseMutationString(input, mockLightweightSchema);
            expect(result).toBeUndefined();
        });
    });

    describe('multi-segment', () => {
        const mockLightweightSchema: ReferenceGenomesLightweightSchema = {
            [SINGLE_REFERENCE]: {
                nucleotideSegmentNames: ['SEQ1', 'SEQ2'],
                geneNames: ['GENE1', 'GENE2'],
                insdcAccessionFull: [],
            },
        };

        it('parses a valid mutation string', () => {
            const result = parseMutationString('GENE1:A23T', mockLightweightSchema);
            expect(result).toEqual({
                baseType: 'aminoAcid',
                mutationType: 'substitutionOrDeletion',
                text: 'GENE1:A23T',
            });
        });

        it.each([
            'INVALID:MUTATION',
            '12345',
            '12345\\',
            'AA-10T',
            'INS_',
            'GENE:',
            ':::',
            'ins_A:23:T',
            'ins_23:A:T',
            'INS_4:G:T',
        ])('returns undefined for invalid mutation string %s', (input) => {
            const result = parseMutationString(input, mockLightweightSchema);
            expect(result).toBeUndefined();
        });

        it('parses a comma-separated mutation string', () => {
            const result = parseMutationsString('GENE1:A23T, SEQ1:123C', mockLightweightSchema);
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
                mockLightweightSchema,
                'aminoAcid',
                'substitutionOrDeletion',
            );
            expect(result).toBe('SEQ1:123C');
        });

        it('converts mutations to search params', () => {
            const params = intoMutationSearchParams('GENE1:A23T, SEQ1:123C, INS_SEQ1:100:G', mockLightweightSchema);
            expect(params).toEqual({
                nucleotideMutations: ['SEQ1:123C'],
                aminoAcidMutations: ['GENE1:A23T'],
                nucleotideInsertions: ['INS_SEQ1:100:G'],
                aminoAcidInsertions: [],
            });
        });
    });
});
