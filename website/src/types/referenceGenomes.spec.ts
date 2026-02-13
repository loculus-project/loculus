/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest';

import type { ReferenceGenomesInfo, ReferenceGenomesSchema } from './referencesGenomes';
import { toReferenceGenomes } from '../utils/sequenceTypeHelpers';

export const SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES: ReferenceGenomesInfo = {
    segmentReferenceGenomes: {
        main: {
            singleReference: {
                lapisName: 'main',
                insdcAccessionFull: 'defaultInsdcAccession',
                genes: [
                    { lapisName: 'gene1', name: 'gene1' },
                    { lapisName: 'gene2', name: 'gene2' },
                ],
            },
        },
    },
    segmentDisplayNames: {},
    isMultiSegmented: false,
    useLapisMultiSegmentedEndpoint: false,
};

export const SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES_SCHEMA: ReferenceGenomesSchema = [
    {
        name: 'main',
        references: [
            {
                name: 'singleReference',
                sequence: 'ATGC',
                insdcAccessionFull: 'defaultInsdcAccession',
                genes: [
                    { name: 'gene1', sequence: 'AAA' },
                    { name: 'gene2', sequence: 'BBB' },
                ],
            },
        ],
    },
];

export const MULTI_SEG_SINGLE_REF_REFERENCEGENOMES: ReferenceGenomesInfo = {
    segmentReferenceGenomes: {
        S: {
            singleReference: {
                lapisName: 'S',
                insdcAccessionFull: 'defaultInsdcAccession1',
                genes: [{ lapisName: 'gene1', name: 'gene1' }],
            },
        },
        L: {
            singleReference: {
                lapisName: 'L',
                insdcAccessionFull: 'defaultInsdcAccession2',
                genes: [{ lapisName: 'gene2', name: 'gene2' }],
            },
        },
    },
    segmentDisplayNames: {},
    isMultiSegmented: true,
    useLapisMultiSegmentedEndpoint: true,
};

export const MULTI_SEG_SINGLE_REF_REFERENCEGENOMES_SCHEMA: ReferenceGenomesSchema = [
    {
        name: 'S',
        references: [
            {
                name: 'singleReference',
                sequence: 'ATGC',
                insdcAccessionFull: 'defaultInsdcAccession1',
                genes: [{ name: 'gene1', sequence: 'AAA' }],
            },
        ],
    },
    {
        name: 'L',
        references: [
            {
                name: 'singleReference',
                sequence: 'GGGG',
                insdcAccessionFull: 'defaultInsdcAccession2',
                genes: [{ name: 'gene2', sequence: 'BBB' }],
            },
        ],
    },
];

export const SINGLE_SEG_MULTI_REF_REFERENCEGENOMES: ReferenceGenomesInfo = {
    segmentReferenceGenomes: {
        main: {
            ref1: {
                lapisName: 'ref1',
                insdcAccessionFull: 'defaultInsdcAccession1',
                genes: [
                    { lapisName: 'gene1-ref1', name: 'gene1' },
                    { lapisName: 'gene2-ref1', name: 'gene2' },
                ],
            },
            ref2: {
                lapisName: 'ref2',
                insdcAccessionFull: 'defaultInsdcAccession2',
                genes: [
                    { lapisName: 'gene1-ref2', name: 'gene1' },
                    { lapisName: 'gene2-ref2', name: 'gene2' },
                ],
            },
        },
    },
    segmentDisplayNames: {},
    isMultiSegmented: false,
    useLapisMultiSegmentedEndpoint: true,
};

export const SINGLE_SEG_MULTI_REF_REFERENCEGENOMES_SCHEMA: ReferenceGenomesSchema = [
    {
        name: 'main',
        references: [
            {
                name: 'ref1',
                sequence: 'ATGC',
                insdcAccessionFull: 'defaultInsdcAccession1',
                genes: [
                    { name: 'gene1', sequence: 'AAA' },
                    { name: 'gene2', sequence: 'BBB' },
                ],
            },
            {
                name: 'ref2',
                sequence: 'CCCC',
                insdcAccessionFull: 'defaultInsdcAccession2',
                genes: [
                    { name: 'gene1', sequence: 'AAA' },
                    { name: 'gene2', sequence: 'BBB' },
                ],
            },
        ],
    },
];

export const MULTI_SEG_MULTI_REF_REFERENCEGENOMES: ReferenceGenomesInfo = {
    segmentReferenceGenomes: {
        L: {
            ref1: {
                lapisName: 'L-ref1',
                insdcAccessionFull: 'defaultInsdcAccession1',
                genes: [
                    { lapisName: 'gene1L-ref1', name: 'gene1L' },
                    { lapisName: 'gene2L-ref1', name: 'gene2L' },
                ],
            },
            ref2: {
                lapisName: 'L-ref2',
                insdcAccessionFull: 'defaultInsdcAccession2',
                genes: [
                    { lapisName: 'gene1L-ref2', name: 'gene1L' },
                    { lapisName: 'gene2L-ref2', name: 'gene2L' },
                ],
            },
        },
        S: {
            singleReference: {
                lapisName: 'S',
                insdcAccessionFull: 'defaultInsdcAccession3',
                genes: [
                    { lapisName: 'gene1S', name: 'gene1S' },
                    { lapisName: 'gene2S', name: 'gene2S' },
                ],
            },
        },
    },
    segmentDisplayNames: {'S': 'S (segment)', 'L': 'L (segment)'},
    isMultiSegmented: true,
    useLapisMultiSegmentedEndpoint: true,
};

export const MULTI_SEG_MULTI_REF_REFERENCEGENOMES_SCHEMA: ReferenceGenomesSchema = [
    {
        name: 'L',
        displayName: 'L (segment)',
        references: [
            {
                name: 'ref1',
                sequence: 'ATGC',
                insdcAccessionFull: 'defaultInsdcAccession1',
                genes: [
                    { name: 'gene1L', sequence: 'AAA' },
                    { name: 'gene2L', sequence: 'BBB' },
                ],
            },
            {
                name: 'ref2',
                sequence: 'CCCC',
                insdcAccessionFull: 'defaultInsdcAccession2',
                genes: [
                    { name: 'gene1L', sequence: 'AAA' },
                    { name: 'gene2L', sequence: 'BBB' },
                ],
            },
        ],
    },
    {
        name: 'S',
        displayName: 'S (segment)',
        references: [
            {
                name: 'singleReference',
                sequence: 'ATGC',
                insdcAccessionFull: 'defaultInsdcAccession3',
                genes: [
                    { name: 'gene1S', sequence: 'AAA' },
                    { name: 'gene2S', sequence: 'BBB' },
                ],
            },
        ],
    },
];

describe('toReferenceGenomes', () => {
    it('maps single segment + single reference', () => {
        expect(toReferenceGenomes(SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES_SCHEMA)).toEqual(
            SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
        );
    });

    it('maps multi segment + single reference per segment', () => {
        expect(toReferenceGenomes(MULTI_SEG_SINGLE_REF_REFERENCEGENOMES_SCHEMA)).toEqual(
            MULTI_SEG_SINGLE_REF_REFERENCEGENOMES,
        );
    });

    it('maps single segment + multiple references', () => {
        expect(toReferenceGenomes(SINGLE_SEG_MULTI_REF_REFERENCEGENOMES_SCHEMA)).toEqual(
            SINGLE_SEG_MULTI_REF_REFERENCEGENOMES,
        );
    });

    it('maps multi segment + multiple references', () => {
        expect(toReferenceGenomes(MULTI_SEG_MULTI_REF_REFERENCEGENOMES_SCHEMA)).toEqual(
            MULTI_SEG_MULTI_REF_REFERENCEGENOMES,
        );
    });

    it('handles undefined input (schema is optional) -> empty map, flags false', () => {
        const input: ReferenceGenomesSchema = undefined;

        expect(toReferenceGenomes(input)).toEqual({
            segmentReferenceGenomes: {},
            segmentDisplayNames: {},
            isMultiSegmented: false,
            useLapisMultiSegmentedEndpoint: false,
        });
    });

    it('defaults optional fields: insdcAccessionFull -> null, genes -> []', () => {
        const input: ReferenceGenomesSchema = [
            {
                name: 'main',
                references: [
                    {
                        name: 'singleReference',
                        sequence: 'ATGC',
                        // no insdcAccessionFull
                        // no genes
                    },
                ],
            },
        ];

        const out = toReferenceGenomes(input);

        expect(out.isMultiSegmented).toBe(false);
        expect(out.useLapisMultiSegmentedEndpoint).toBe(false);

        expect(out.segmentReferenceGenomes.main.singleReference.insdcAccessionFull).toBeNull();
        expect(out.segmentReferenceGenomes.main.singleReference.genes).toEqual([]);
    });

    it('overwrites duplicate name within same segment (last wins)', () => {
        const input: ReferenceGenomesSchema = [
            {
                name: 'main',
                references: [
                    {
                        name: 'dup',
                        sequence: 'AAAA',
                        insdcAccessionFull: 'first',
                        genes: [{ name: 'gene1', sequence: 'AAA' }],
                    },
                    {
                        name: 'dup',
                        sequence: 'BBBB',
                        insdcAccessionFull: 'second',
                        genes: [{ name: 'gene2', sequence: 'BBB' }],
                    },
                ],
            },
        ];

        const out = toReferenceGenomes(input);

        expect(out.segmentReferenceGenomes.main.dup.insdcAccessionFull).toBe('second');
        expect(out.segmentReferenceGenomes.main.dup.genes.map((g) => g.name)).toEqual(['gene2']);
    });
});
