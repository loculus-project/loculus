import { describe, test, expect } from 'vitest';

import { getSegmentAndGeneDisplayNameMap } from './getSegmentAndGeneDisplayNameMap.tsx';
import type { ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes.ts';

describe('getSegmentAndGeneDisplayNameMap', () => {
    test('should map nothing if there is only a single reference with no segments', () => {
        const schema: ReferenceGenomesLightweightSchema = {
            segments: {},
        };
        const map = getSegmentAndGeneDisplayNameMap(schema);

        expect(map.size).equals(0);
    });

    test('should map segments and genes for multiple references', () => {
        const schema: ReferenceGenomesLightweightSchema = {
            segments: {
                segment1: {
                    references: ['suborganism1', 'suborganism2'],
                    insdcAccessions: {},
                    genesByReference: {},
                },
                segment2: {
                    references: ['suborganism1', 'suborganism2'],
                    insdcAccessions: {},
                    genesByReference: {
                        suborganism1: ['gene1', 'gene2'],
                        suborganism2: ['gene1', 'gene3'],
                    },
                },
            },
        };
        const map = getSegmentAndGeneDisplayNameMap(schema);

        expect(map.get('suborganism1-segment1')).equals('segment1');
        expect(map.get('suborganism2-segment1')).equals('segment1');
        expect(map.get('suborganism2-segment2')).equals('segment2');
        expect(map.get('suborganism2-gene3')).equals('gene3');
    });

    test('should not prefix segments when there is only a single reference', () => {
        const schema: ReferenceGenomesLightweightSchema = {
            segments: {
                main: {
                    references: ['ref1'],
                    insdcAccessions: {},
                    genesByReference: {
                        ref1: ['gene1', 'gene2'],
                    },
                },
            },
        };
        const map = getSegmentAndGeneDisplayNameMap(schema);

        expect(map.get('main')).equals('main');
        expect(map.get('gene1')).equals('gene1');
        expect(map.get('gene2')).equals('gene2');
    });
});
