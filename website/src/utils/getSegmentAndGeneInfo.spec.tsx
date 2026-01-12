/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, test } from 'vitest';

import { getSegmentAndGeneInfo } from './getSegmentAndGeneInfo.tsx';
import type { ReferenceGenomesMap } from '../types/referencesGenomes.ts';

describe('getSegmentAndGeneInfo', () => {
    describe('with single reference per segment', () => {
        test('should return correct names for multi-segmented organism', () => {
            const schema: ReferenceGenomesMap = {
                segments: {
                    segment1: {
                        references: ['ref1'],
                        insdcAccessions: {},
                        genesByReference: {
                            ref1: ['gene1'],
                        },
                    },
                    segment2: {
                        references: ['ref1'],
                        insdcAccessions: {},
                        genesByReference: {
                            ref1: ['gene2'],
                        },
                    },
                },
            };

            const selectedReferences = {
                segment1: 'ref1',
                segment2: 'ref1',
            };

            const result = getSegmentAndGeneInfo(schema, selectedReferences);

            expect(result).toEqual({
                nucleotideSegmentInfos: [
                    { lapisName: 'segment1', label: 'segment1' },
                    { lapisName: 'segment2', label: 'segment2' },
                ],
                geneInfos: [
                    { lapisName: 'gene1', label: 'gene1' },
                    { lapisName: 'gene2', label: 'gene2' },
                ],
                isMultiSegmented: true,
            });
        });

        test('should return correct names for single-segmented organism', () => {
            const schema: ReferenceGenomesMap = {
                segments: {
                    main: {
                        references: ['ref1'],
                        insdcAccessions: {},
                        genesByReference: {
                            ref1: ['gene1'],
                        },
                    },
                },
            };

            const selectedReferences = {
                main: 'ref1',
            };

            const result = getSegmentAndGeneInfo(schema, selectedReferences);

            expect(result).toEqual({
                nucleotideSegmentInfos: [{ lapisName: 'main', label: 'main' }],
                geneInfos: [{ lapisName: 'gene1', label: 'gene1' }],
                isMultiSegmented: false,
            });
        });
    });

    describe('with multiple references (mixed)', () => {
        test('should handle different references for different segments', () => {
            const schema: ReferenceGenomesMap = {
                segments: {
                    segment1: {
                        references: ['CV-A16', 'CV-A10'],
                        insdcAccessions: {},
                        genesByReference: {
                            'CV-A16': ['gene1'],
                            'CV-A10': ['gene1'],
                        },
                    },
                    segment2: {
                        references: ['CV-A16', 'CV-A10'],
                        insdcAccessions: {},
                        genesByReference: {
                            'CV-A16': ['gene2'],
                            'CV-A10': ['gene2'],
                        },
                    },
                },
            };

            const selectedReferences = {
                segment1: 'CV-A16',
                segment2: 'CV-A10',
            };

            const result = getSegmentAndGeneInfo(schema, selectedReferences);

            expect(result).toEqual({
                nucleotideSegmentInfos: [
                    { lapisName: 'CV-A16-segment1', label: 'segment1' },
                    { lapisName: 'CV-A10-segment2', label: 'segment2' },
                ],
                geneInfos: [
                    { lapisName: 'CV-A16-gene1', label: 'gene1' },
                    { lapisName: 'CV-A10-gene2', label: 'gene2' },
                ],
                isMultiSegmented: true,
            });
        });

        test('should handle segments without selected references', () => {
            const schema: ReferenceGenomesMap = {
                segments: {
                    segment1: {
                        references: ['CV-A16', 'CV-A10'],
                        insdcAccessions: {},
                        genesByReference: {
                            'CV-A16': ['gene1'],
                            'CV-A10': ['gene1'],
                        },
                    },
                    segment2: {
                        references: ['CV-A16', 'CV-A10'],
                        insdcAccessions: {},
                        genesByReference: {
                            'CV-A16': ['gene2'],
                            'CV-A10': ['gene2'],
                        },
                    },
                },
            };

            const selectedReferences = {
                segment1: 'CV-A16',
                // segment2 not selected
            };

            const result = getSegmentAndGeneInfo(schema, selectedReferences);

            expect(result).toEqual({
                nucleotideSegmentInfos: [
                    { lapisName: 'CV-A16-segment1', label: 'segment1' },
                    { lapisName: 'segment2', label: 'segment2' }, // No reference selected
                ],
                geneInfos: [
                    { lapisName: 'CV-A16-gene1', label: 'gene1' },
                    // gene2 not included since segment2 has no reference
                ],
                isMultiSegmented: true,
            });
        });

        test('should handle empty selectedReferences', () => {
            const schema: ReferenceGenomesMap = {
                segments: {
                    main: {
                        references: ['ref1'],
                        insdcAccessions: {},
                        genesByReference: {
                            ref1: ['gene1'],
                        },
                    },
                },
            };

            const selectedReferences = {};

            const result = getSegmentAndGeneInfo(schema, selectedReferences);

            expect(result).toEqual({
                nucleotideSegmentInfos: [{ lapisName: 'main', label: 'main' }],
                geneInfos: [],
                isMultiSegmented: false,
            });
        });
    });
});
