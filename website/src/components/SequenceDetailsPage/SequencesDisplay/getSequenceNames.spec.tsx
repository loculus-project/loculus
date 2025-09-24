import { describe, expect, test } from 'vitest';

import { getSequenceNames } from './getSequenceNames.tsx';
import { SINGLE_REFERENCE } from '../../../types/referencesGenomes.ts';

describe('getSequenceNames', () => {
    describe('with single reference', () => {
        test('should return correct names for multi-segmented organism', () => {
            const referenceGenomeSequenceNames = {
                [SINGLE_REFERENCE]: {
                    nucleotideSequences: ['segment1', 'segment2'],
                    genes: ['gene1', 'gene2'],
                    insdcAccessionFull: [],
                },
            };

            const result = getSequenceNames(referenceGenomeSequenceNames, SINGLE_REFERENCE);

            expect(result).to.deep.equal({
                nucleotideSegmentNames: [
                    { lapisName: 'segment1', label: 'segment1' },
                    { lapisName: 'segment2', label: 'segment2' },
                ],
                genes: [
                    { lapisName: 'gene1', label: 'gene1' },
                    { lapisName: 'gene2', label: 'gene2' },
                ],
                isMultiSegmented: true,
            });
        });

        test('should return correct names for single-segmented organism', () => {
            const referenceGenomeSequenceNames = {
                [SINGLE_REFERENCE]: {
                    nucleotideSequences: ['main'],
                    genes: ['gene1'],
                    insdcAccessionFull: [],
                },
            };

            const result = getSequenceNames(referenceGenomeSequenceNames, SINGLE_REFERENCE);

            expect(result).to.deep.equal({
                nucleotideSegmentNames: [{ lapisName: 'main', label: 'main' }],
                genes: [{ lapisName: 'gene1', label: 'gene1' }],
                isMultiSegmented: false,
            });
        });
    });

    describe('with multiple references', () => {
        const suborganism = 'sub1';

        test('should return correct names for multi-segmented suborganism', () => {
            const referenceGenomeSequenceNames = {
                [suborganism]: {
                    nucleotideSequences: ['segment1', 'segment2'],
                    genes: ['gene1', 'gene2'],
                    insdcAccessionFull: [],
                },
                anotherSuborganism: {
                    nucleotideSequences: ['segmentA', 'segmentB'],
                    genes: ['geneA'],
                    insdcAccessionFull: [],
                },
            };

            const result = getSequenceNames(referenceGenomeSequenceNames, suborganism);

            expect(result).to.deep.equal({
                nucleotideSegmentNames: [
                    { lapisName: 'sub1-segment1', label: 'segment1' },
                    { lapisName: 'sub1-segment2', label: 'segment2' },
                ],
                genes: [
                    { lapisName: 'sub1-gene1', label: 'gene1' },
                    { lapisName: 'sub1-gene2', label: 'gene2' },
                ],
                isMultiSegmented: true,
            });
        });

        test('should return correct names for single-segmented suborganism', () => {
            const referenceGenomeSequenceNames = {
                [suborganism]: {
                    nucleotideSequences: ['main'],
                    genes: ['gene1'],
                    insdcAccessionFull: [],
                },
                anotherSuborganism: {
                    nucleotideSequences: ['segmentA', 'segmentB'],
                    genes: ['geneA', 'geneB'],
                    insdcAccessionFull: [],
                },
            };

            const result = getSequenceNames(referenceGenomeSequenceNames, suborganism);

            expect(result).to.deep.equal({
                nucleotideSegmentNames: [{ lapisName: 'sub1', label: 'main' }],
                genes: [{ lapisName: 'sub1-gene1', label: 'gene1' }],
                isMultiSegmented: true,
            });
        });
    });
});
