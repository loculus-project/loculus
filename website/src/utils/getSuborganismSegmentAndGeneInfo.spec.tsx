import { describe, expect, test } from 'vitest';

import { getSuborganismSegmentAndGeneInfo } from './getSuborganismSegmentAndGeneInfo.tsx';
import { SINGLE_REFERENCE } from '../types/referencesGenomes.ts';

describe('getSuborganismSegmentAndGeneInfo', () => {
    describe('with single reference', () => {
        test('should return correct names for multi-segmented organism', () => {
            const referenceGenomeSequenceNames = {
                [SINGLE_REFERENCE]: {
                    nucleotideSegmentNames: ['segment1', 'segment2'],
                    geneNames: ['gene1', 'gene2'],
                    insdcAccessionFull: [],
                },
            };

            const result = getSuborganismSegmentAndGeneInfo(referenceGenomeSequenceNames, SINGLE_REFERENCE);

            expect(result).to.deep.equal({
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
            const referenceGenomeSequenceNames = {
                [SINGLE_REFERENCE]: {
                    nucleotideSegmentNames: ['main'],
                    geneNames: ['gene1'],
                    insdcAccessionFull: [],
                },
            };

            const result = getSuborganismSegmentAndGeneInfo(referenceGenomeSequenceNames, SINGLE_REFERENCE);

            expect(result).to.deep.equal({
                nucleotideSegmentInfos: [{ lapisName: 'main', label: 'main' }],
                geneInfos: [{ lapisName: 'gene1', label: 'gene1' }],
                isMultiSegmented: false,
            });
        });
    });

    describe('with multiple references', () => {
        const suborganism = 'sub1';

        test('should return correct names for multi-segmented suborganism', () => {
            const referenceGenomeSequenceNames = {
                [suborganism]: {
                    nucleotideSegmentNames: ['segment1', 'segment2'],
                    geneNames: ['gene1', 'gene2'],
                    insdcAccessionFull: [],
                },
                anotherSuborganism: {
                    nucleotideSegmentNames: ['segmentA', 'segmentB'],
                    geneNames: ['geneA'],
                    insdcAccessionFull: [],
                },
            };

            const result = getSuborganismSegmentAndGeneInfo(referenceGenomeSequenceNames, suborganism);

            expect(result).to.deep.equal({
                nucleotideSegmentInfos: [
                    { lapisName: 'sub1-segment1', label: 'segment1' },
                    { lapisName: 'sub1-segment2', label: 'segment2' },
                ],
                geneInfos: [
                    { lapisName: 'sub1-gene1', label: 'gene1' },
                    { lapisName: 'sub1-gene2', label: 'gene2' },
                ],
                isMultiSegmented: true,
            });
        });

        test('should return correct names for single-segmented suborganism', () => {
            const referenceGenomeSequenceNames = {
                [suborganism]: {
                    nucleotideSegmentNames: ['main'],
                    geneNames: ['gene1'],
                    insdcAccessionFull: [],
                },
                anotherSuborganism: {
                    nucleotideSegmentNames: ['segmentA', 'segmentB'],
                    geneNames: ['geneA', 'geneB'],
                    insdcAccessionFull: [],
                },
            };

            const result = getSuborganismSegmentAndGeneInfo(referenceGenomeSequenceNames, suborganism);

            expect(result).to.deep.equal({
                nucleotideSegmentInfos: [{ lapisName: 'sub1', label: 'main' }],
                geneInfos: [{ lapisName: 'sub1-gene1', label: 'gene1' }],
                isMultiSegmented: true,
            });
        });

        test('should return null when no suborganism is selected', () => {
            const referenceGenomeSequenceNames = {
                [suborganism]: {
                    nucleotideSegmentNames: ['main'],
                    geneNames: ['gene1'],
                    insdcAccessionFull: [],
                },
                anotherSuborganism: {
                    nucleotideSegmentNames: ['segmentA', 'segmentB'],
                    geneNames: ['geneA', 'geneB'],
                    insdcAccessionFull: [],
                },
            };

            const result = getSuborganismSegmentAndGeneInfo(referenceGenomeSequenceNames, null);

            expect(result).toBeNull();
        });

        test('should return null when unknown suborganism is selected', () => {
            const referenceGenomeSequenceNames = {
                [suborganism]: {
                    nucleotideSegmentNames: ['main'],
                    geneNames: ['gene1'],
                    insdcAccessionFull: [],
                },
                anotherSuborganism: {
                    nucleotideSegmentNames: ['segmentA', 'segmentB'],
                    geneNames: ['geneA', 'geneB'],
                    insdcAccessionFull: [],
                },
            };

            const result = getSuborganismSegmentAndGeneInfo(referenceGenomeSequenceNames, 'unknownSuborganism');

            expect(result).toBeNull();
        });
    });
});
