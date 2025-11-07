import { describe, test, expect } from 'vitest';

import { getSegmentAndGeneDisplayNameMap } from './getSegmentAndGeneDisplayNameMap.tsx';
import { SINGLE_REFERENCE } from '../../types/referencesGenomes.ts';

describe('getSegmentAndGeneDisplayNameMap', () => {
    test('should map nothing if there is only a single reference', () => {
        const map = getSegmentAndGeneDisplayNameMap({
            [SINGLE_REFERENCE]: { nucleotideSegmentNames: [], geneNames: [], insdcAccessionFull: [] },
        });

        expect(map.size).equals(0);
    });

    test('should map segments and genes for multiple references', () => {
        const map = getSegmentAndGeneDisplayNameMap({
            suborganism1: {
                nucleotideSegmentNames: ['segment1', 'segment2'],
                geneNames: ['gene1', 'gene2'],
                insdcAccessionFull: [],
            },
            suborganism2: {
                nucleotideSegmentNames: ['segment1', 'segment2'],
                geneNames: ['gene1', 'gene3'],
                insdcAccessionFull: [],
            },
        });

        expect(map.get('suborganism1-segment1')).equals('segment1');
        expect(map.get('suborganism2-segment1')).equals('segment1');
        expect(map.get('suborganism2-gene3')).equals('gene3');
    });

    test('should map segment names to "main" when suborganism only has one segment', () => {
        const map = getSegmentAndGeneDisplayNameMap({
            suborganism1: {
                nucleotideSegmentNames: ['main'],
                geneNames: ['gene1', 'gene2'],
                insdcAccessionFull: [],
            },
            suborganism2: {
                nucleotideSegmentNames: ['main'],
                geneNames: ['gene1', 'gene3'],
                insdcAccessionFull: [],
            },
        });

        expect(map.get('suborganism1')).equals('main');
        expect(map.get('suborganism2')).equals('main');
    });
});
