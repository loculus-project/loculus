import { describe, expect, it } from 'vitest';

import type { SuborganismSegmentAndGeneInfo } from './getSuborganismSegmentAndGeneInfo.tsx';
import {
    intoMutationSearchParams,
    parseMutationsString,
    parseMutationString,
    removeMutationQueries,
    serializeMutationQueries,
} from './mutation';
import { type ReferenceGenomesLightweightSchema, SINGLE_REFERENCE } from '../types/referencesGenomes';

describe('mutation', () => {
    describe('single segment', () => {
        const mockSuborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo = {
            nucleotideSegmentInfos: [
                {
                    lapisName: 'lapisName-main',
                    label: 'label-main',
                },
            ],
            geneInfos: [
                {
                    lapisName: 'lapisName-gene1',
                    label: 'label-gene1',
                },
                {
                    lapisName: 'lapisName-gene2',
                    label: 'label-gene2',
                },
            ],
            isMultiSegmented: false,
        };

        it.each([
            [
                'A23.',
                { baseType: 'nucleotide', mutationType: 'substitutionOrDeletion', text: 'A23.', lapisQuery: 'A23.' },
            ],
            ['23T', { baseType: 'nucleotide', mutationType: 'substitutionOrDeletion', text: '23T', lapisQuery: '23T' }],
            [
                'A23T',
                { baseType: 'nucleotide', mutationType: 'substitutionOrDeletion', text: 'A23T', lapisQuery: 'A23T' },
            ],
            ['23', { baseType: 'nucleotide', mutationType: 'substitutionOrDeletion', text: '23', lapisQuery: '23' }],
            ['A23', { baseType: 'nucleotide', mutationType: 'substitutionOrDeletion', text: 'A23', lapisQuery: 'A23' }],
            [
                'label-GENE1:A23T',
                {
                    baseType: 'aminoAcid',
                    mutationType: 'substitutionOrDeletion',
                    text: 'label-GENE1:A23T',
                    lapisQuery: 'lapisName-gene1:A23T',
                },
            ],
            [
                'label-GENE2:*23',
                {
                    baseType: 'aminoAcid',
                    mutationType: 'substitutionOrDeletion',
                    text: 'label-GENE2:*23',
                    lapisQuery: 'lapisName-gene2:*23',
                },
            ],
            [
                'label-GENE1:23*',
                {
                    baseType: 'aminoAcid',
                    mutationType: 'substitutionOrDeletion',
                    text: 'label-GENE1:23*',
                    lapisQuery: 'lapisName-gene1:23*',
                },
            ],
            [
                'label-GENE1:23.',
                {
                    baseType: 'aminoAcid',
                    mutationType: 'substitutionOrDeletion',
                    text: 'label-GENE1:23.',
                    lapisQuery: 'lapisName-gene1:23.',
                },
            ],
            [
                'INS_100:G',
                {
                    baseType: 'nucleotide',
                    mutationType: 'insertion',
                    text: 'INS_100:G',
                    lapisQuery: 'ins_100:G',
                },
            ],
            [
                'INS_label-GENE1:23:T*?',
                {
                    baseType: 'aminoAcid',
                    mutationType: 'insertion',
                    text: 'INS_label-GENE1:23:T*?',
                    lapisQuery: 'ins_lapisName-gene1:23:T*?',
                },
            ],
        ])('parses the valid mutation string "%s"', (input, expected) => {
            const result = parseMutationString(input, mockSuborganismSegmentAndGeneInfo);
            expect(result).toEqual(expected);
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
            const result = parseMutationString(input, mockSuborganismSegmentAndGeneInfo);
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
