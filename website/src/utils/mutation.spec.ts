import { describe, expect, it } from 'vitest';

import {
    intoMutationSearchParams,
    type MutationQuery,
    parseMutationsString,
    parseMutationString,
    serializeMutationQueries,
} from './mutation';
import type { SegmentAndGeneInfo, SingleSegmentAndGeneInfo } from './sequenceTypeHelpers';

describe('mutation', () => {
    describe('single segment', () => {
        const mockSegmentAndGeneInfo: SingleSegmentAndGeneInfo = {
            nucleotideSegmentInfo: {
                lapisName: 'lapisName-main',
                name: 'label-main',
            },
            geneInfos,
            useLapisMultiSegmentedEndpoint: false,
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
            const result = parseMutationString(input, mockSegmentAndGeneInfo);
            expect(result).toEqual(expected);
        });

        it.each([
            'INVALID:MUTATION',
            'AA-10T',
            '123\\',
            '123*',
            'INS_',
            'INS_123:TT*',
            'INS_label-SEQ1:123:TT*',
            'GENE:',
            'label-GENE1:',
            'label-GENE1:A23T:',
            'label-GENE1:A23T:123',
            ':::',
            'ins_A:23:T',
            'ins_23:A:T',
            'INS_4:G:T',
            'INS_label-GENE1:23:TTT:',
            'INS_label-GENE1:23:TTT:INVALID',
        ])('returns undefined for invalid mutation string %s', (input) => {
            const result = parseMutationString(input, mockSegmentAndGeneInfo);
            expect(result).toBeUndefined();
        });
    });

    describe('single segmented case with multiple references', () => {
        const mockSegmentAndGeneInfo: SingleSegmentAndGeneInfo = {
            nucleotideSegmentInfo: {
                lapisName: 'lapisName-main',
                name: 'label-main',
            },
            geneInfos,
            useLapisMultiSegmentedEndpoint: true,
            multiSegmented: false,
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
            const result = parseMutationString(input, mockSegmentAndGeneInfo);
            expect(result).toEqual(expected);
        });

        it.each(['lapisName-main:A123T', 'label-main:A123T'])(
            'returns undefined for invalid mutation string %s',
            (input) => {
                const result = parseMutationString(input, mockSegmentAndGeneInfo);
                expect(result).toBeUndefined();
            },
        );
    });

    describe('multi-segment with selected reference', () => {
        const mockSingleSegmentAndGeneInfo: SingleSegmentAndGeneInfo = {
            nucleotideSegmentInfo: {
                lapisName: 'lapisName-SEQ1',
                name: 'label-SEQ1',
            },
            geneInfos,
            useLapisMultiSegmentedEndpoint: true,
            multiSegmented: true,
        };
        const mockSegmentAndGeneInfo: SegmentAndGeneInfo = {
            nucleotideSegmentInfos: [
                {
                    lapisName: 'lapisName-SEQ1',
                    name: 'label-SEQ1',
                },
                {
                    lapisName: 'lapisName-SEQ2',
                    name: 'label-SEQ2',
                },
            ],
            geneInfos,
            useLapisMultiSegmentedEndpoint: true,
            multiSegmented: true,
        };

        const nucleotideMutationCases: [string, MutationQuery][] = [
            [
                'A23.',
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: 'A23.',
                    lapisQuery: 'lapisName-SEQ1:A23.',
                },
            ],
            [
                'A23T',
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: 'A23T',
                    lapisQuery: 'lapisName-SEQ1:A23T',
                },
            ],
            [
                '23',
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: '23',
                    lapisQuery: 'lapisName-SEQ1:23',
                },
            ],
            [
                'A23',
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: 'A23',
                    lapisQuery: 'lapisName-SEQ1:A23',
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
                    lapisQuery: 'ins_lapisName-SEQ1:100:G',
                },
            ],
            ...aminoAcidInsertionCases,
        ])('parses the valid mutation string "%s"', (input, expected) => {
            const result = parseMutationString(input, mockSingleSegmentAndGeneInfo);
            expect(result).toEqual(expected);
        });

        it.each([
            'INVALID:MUTATION',
            'S:12345',
            '12345\\',
            'AA-10T',
            'INS_',
            'INS_123:TT*',
            'INS_label-SEQ1:123:TT*',
            'GENE:',
            ':::',
            'ins_A:23:T',
            'ins_23:A:T',
            'INS_4:G:T',
        ])('returns undefined for invalid mutation string %s', (input) => {
            const result = parseMutationString(input, mockSingleSegmentAndGeneInfo);
            expect(result).toBeUndefined();
        });

        it('parses a comma-separated mutation string', () => {
            const result = parseMutationsString('label-GENE1:A23T, 123C', mockSingleSegmentAndGeneInfo);
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
                    text: '123C',
                    lapisQuery: 'lapisName-SEQ1:123C',
                },
            ]);
        });

        it('serializes mutation queries back to string', () => {
            const serialized = serializeMutationQueries([
                {
                    baseType: 'aminoAcid',
                    mutationType: 'substitutionOrDeletion',
                    text: 'GENE1:A23T',
                    lapisQuery: 'lapisName-GENE1:A23T',
                },
                {
                    baseType: 'nucleotide',
                    mutationType: 'substitutionOrDeletion',
                    text: 'SEQ1:123C',
                    lapisQuery: 'lapisName-SEQ1:123C',
                },
            ]);
            expect(serialized).toBe('GENE1:A23T, SEQ1:123C');
        });

        it('converts mutations to search params', () => {
            const params = intoMutationSearchParams(
                //eslint-disable-next-line @typescript-eslint/naming-convention
                { 'mutation_label-SEQ1': 'label-GENE1:A23T, 123C, INS_100:G' },
                mockSegmentAndGeneInfo,
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
        segmentName: 'label-SEQ1',
        name: 'label-gene1',
    },
    {
        lapisName: 'lapisName-gene2',
        segmentName: 'label-SEQ2',
        name: 'label-gene2',
    },
];
