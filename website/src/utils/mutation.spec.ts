import { describe, expect, it } from 'vitest';

import type { SuborganismSegmentAndGeneInfo } from './getSuborganismSegmentAndGeneInfo.tsx';
import {
    intoMutationSearchParams,
    type MutationQuery,
    parseMutationsString,
    parseMutationString,
    removeMutationQueries,
    serializeMutationQueries,
} from './mutation';

describe('mutation', () => {
    describe('single segment', () => {
        const mockSuborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo = {
            nucleotideSegmentInfos: [
                {
                    lapisName: 'lapisName-main',
                    label: 'label-main',
                },
            ],
            geneInfos,
            isMultiSegmented: false,
        };

        const nucleotideMutationCases: [string, MutationQuery][] = [
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
        ];

        it.each([
            ...nucleotideMutationCases,
            ...aminoAcidMutationCases,
            [
                'INS_100:G',
                {
                    baseType: 'nucleotide',
                    mutationType: 'insertion',
                    text: 'INS_100:G',
                    lapisQuery: 'ins_100:G',
                },
            ],
            ...aminoAcidInsertionCases,
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

    describe('single segmented case with multiple suborganism', () => {
        const mockSuborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo = {
            nucleotideSegmentInfos: [
                {
                    lapisName: 'lapisName-main',
                    label: 'label-main',
                },
            ],
            geneInfos,
            isMultiSegmented: true,
        };

        const nucleotideMutationCases: [string, MutationQuery][] = [
            [
                'A23.',
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: 'A23.',
                    lapisQuery: 'lapisName-main:A23.',
                },
            ],
            [
                '23T',
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: '23T',
                    lapisQuery: 'lapisName-main:23T',
                },
            ],
            [
                'A23T',
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: 'A23T',
                    lapisQuery: 'lapisName-main:A23T',
                },
            ],
            [
                '23',
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: '23',
                    lapisQuery: 'lapisName-main:23',
                },
            ],
            [
                'A23',
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: 'A23',
                    lapisQuery: 'lapisName-main:A23',
                },
            ],
        ];

        it.each([
            ...nucleotideMutationCases,
            ...aminoAcidMutationCases,
            [
                'INS_100:G',
                {
                    baseType: 'nucleotide',
                    mutationType: 'insertion',
                    text: 'INS_100:G',
                    lapisQuery: 'ins_lapisName-main:100:G',
                },
            ],
            ...aminoAcidInsertionCases,
        ])('parses the valid mutation string "%s"', (input, expected) => {
            const result = parseMutationString(input, mockSuborganismSegmentAndGeneInfo);
            expect(result).toEqual(expected);
        });

        it.each(['lapisName-main:A123T', 'label-main:A123T'])(
            'returns undefined for invalid mutation string %s',
            (input) => {
                const result = parseMutationString(input, mockSuborganismSegmentAndGeneInfo);
                expect(result).toBeUndefined();
            },
        );
    });

    describe('multi-segment', () => {
        const mockSuborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo = {
            nucleotideSegmentInfos: [
                {
                    lapisName: 'lapisName-SEQ1',
                    label: 'label-SEQ1',
                },
                {
                    lapisName: 'lapisName-SEQ2',
                    label: 'label-SEQ2',
                },
            ],
            geneInfos,
            isMultiSegmented: true,
        };

        const nucleotideMutationCases: [string, MutationQuery][] = [
            [
                'label-SEQ1:A23.',
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: 'label-SEQ1:A23.',
                    lapisQuery: 'lapisName-SEQ1:A23.',
                },
            ],
            [
                'label-SEQ2:23T',
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: 'label-SEQ2:23T',
                    lapisQuery: 'lapisName-SEQ2:23T',
                },
            ],
            [
                'label-SEQ1:A23T',
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: 'label-SEQ1:A23T',
                    lapisQuery: 'lapisName-SEQ1:A23T',
                },
            ],
            [
                'label-SEQ1:23',
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: 'label-SEQ1:23',
                    lapisQuery: 'lapisName-SEQ1:23',
                },
            ],
            [
                'label-SEQ1:A23',
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: 'label-SEQ1:A23',
                    lapisQuery: 'lapisName-SEQ1:A23',
                },
            ],
        ];

        it.each([
            ...nucleotideMutationCases,
            ...aminoAcidMutationCases,
            [
                'INS_label-SEQ1:100:G',
                {
                    baseType: 'nucleotide',
                    mutationType: 'insertion',
                    text: 'INS_label-SEQ1:100:G',
                    lapisQuery: 'ins_lapisName-SEQ1:100:G',
                },
            ],
            ...aminoAcidInsertionCases,
        ])('parses the valid mutation string "%s"', (input, expected) => {
            const result = parseMutationString(input, mockSuborganismSegmentAndGeneInfo);
            expect(result).toEqual(expected);
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
            const result = parseMutationString(input, mockSuborganismSegmentAndGeneInfo);
            expect(result).toBeUndefined();
        });

        it('parses a comma-separated mutation string', () => {
            const result = parseMutationsString('label-GENE1:A23T, label-SEQ1:123C', mockSuborganismSegmentAndGeneInfo);
            expect(result).toEqual([
                {
                    baseType: 'aminoAcid',
                    mutationType: 'substitutionOrDeletion',
                    text: 'label-GENE1:A23T',
                    lapisQuery: 'lapisName-gene1:A23T',
                },
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: 'label-SEQ1:123C',
                    lapisQuery: 'lapisName-SEQ1:123C',
                },
            ]);
        });

        it('serializes mutation queries back to string', () => {
            const serialized = serializeMutationQueries([
                { baseType: 'aminoAcid', mutationType: 'substitutionOrDeletion', text: 'GENE1:A23T', lapisQuery: '' },
                { baseType: 'nucleotide', mutationType: 'substitutionOrDeletion', text: 'SEQ1:123C', lapisQuery: '' },
            ]);
            expect(serialized).toBe('GENE1:A23T, SEQ1:123C');
        });

        it('removes specified mutation queries', () => {
            const result = removeMutationQueries(
                'label-GENE1:A23T, label-SEQ1:123C',
                mockSuborganismSegmentAndGeneInfo,
                'aminoAcid',
                'substitutionOrDeletion',
            );
            expect(result).toBe('label-SEQ1:123C');
        });

        it('converts mutations to search params', () => {
            const params = intoMutationSearchParams(
                'label-GENE1:A23T, label-SEQ1:123C, INS_label-SEQ1:100:G',
                mockSuborganismSegmentAndGeneInfo,
            );
            expect(params).toEqual({
                nucleotideMutations: ['lapisName-SEQ1:123C'],
                aminoAcidMutations: ['lapisName-gene1:A23T'],
                nucleotideInsertions: ['ins_lapisName-SEQ1:100:G'],
                aminoAcidInsertions: [],
            });
        });
    });
});

const aminoAcidMutationCases: [string, MutationQuery][] = [
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
];

const aminoAcidInsertionCases: [string, MutationQuery][] = [
    [
        'INS_label-GENE1:23:T*?',
        {
            baseType: 'aminoAcid',
            mutationType: 'insertion',
            text: 'INS_label-GENE1:23:T*?',
            lapisQuery: 'ins_lapisName-gene1:23:T*?',
        },
    ],
];

const geneInfos = [
    {
        lapisName: 'lapisName-gene1',
        label: 'label-gene1',
    },
    {
        lapisName: 'lapisName-gene2',
        label: 'label-gene2',
    },
];
