/* eslint-disable @typescript-eslint/naming-convention */
import { describe, it, expect } from 'vitest';

import type { SegmentReferenceSelections } from './sequenceTypeHelpers';
import {
    getSegmentAndGeneInfo,
    getInsdcAccessionsFromSegmentReferences,
    lapisNameToDisplayName,
    segmentsWithMultipleReferences,
    allReferencesSelected,
} from './sequenceTypeHelpers';
import {
    SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
    MULTI_SEG_SINGLE_REF_REFERENCEGENOMES,
    SINGLE_SEG_MULTI_REF_REFERENCEGENOMES,
} from '../types/referenceGenomes.spec.ts';

describe('getSegmentAndGeneInfo', () => {
    it('single segment + single reference: ignores selection, uses segment name as lapisName, includes genes', () => {
        const selected: SegmentReferenceSelections = { main: null };

        const out = getSegmentAndGeneInfo(SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES, selected);

        expect(out).toEqual({
            nucleotideSegmentInfos: [{ name: 'main', lapisName: 'main' }],
            geneInfos: [
                { lapisName: 'gene1', name: 'gene1', segmentName: 'main' },
                { lapisName: 'gene2', name: 'gene2', segmentName: 'main' },
            ],
            useLapisMultiSegmentedEndpoint: false,
            multiSegmented: false,
        });
    });

    it('multi segment + single reference per segment: includes all segments even if selections are null', () => {
        const selected: SegmentReferenceSelections = { S: null, L: null };

        const out = getSegmentAndGeneInfo(MULTI_SEG_SINGLE_REF_REFERENCEGENOMES, selected);

        expect(out.nucleotideSegmentInfos).toEqual([
            { name: 'S', lapisName: 'S' },
            { name: 'L', lapisName: 'L' },
        ]);

        expect(out.geneInfos).toEqual([
            { lapisName: 'gene1', name: 'gene1', segmentName: 'S' },
            { lapisName: 'gene2', name: 'gene2', segmentName: 'L' },
        ]);

        expect(out.useLapisMultiSegmentedEndpoint).toBe(true);
        expect(out.multiSegmented).toBe(true);
    });

    it('single segment + multiple references: requires selection; uses selected reference lapisName and genes', () => {
        const selected: SegmentReferenceSelections = { main: 'ref2' };

        const out = getSegmentAndGeneInfo(SINGLE_SEG_MULTI_REF_REFERENCEGENOMES, selected);

        expect(out.nucleotideSegmentInfos).toEqual([{ name: 'main', lapisName: 'ref2' }]);
        expect(out.geneInfos).toEqual([
            { lapisName: 'gene1-ref2', name: 'gene1', segmentName: 'main' },
            { lapisName: 'gene2-ref2', name: 'gene2', segmentName: 'main' },
        ]);
        expect(out.useLapisMultiSegmentedEndpoint).toBe(true);
        expect(out.multiSegmented).toBe(false);
    });

    it('single segment + multiple references: if no selection, returns empty arrays', () => {
        const selected: SegmentReferenceSelections = { main: null };

        const out = getSegmentAndGeneInfo(SINGLE_SEG_MULTI_REF_REFERENCEGENOMES, selected);

        expect(out.nucleotideSegmentInfos).toEqual([]);
        expect(out.geneInfos).toEqual([]);
        expect(out.useLapisMultiSegmentedEndpoint).toBe(true);
        expect(out.multiSegmented).toBe(false);
    });
});

describe('getInsdcAccessionsFromSegmentReferences', () => {
    it('single segment + single reference: returns accession even if selection is null', () => {
        const selected: SegmentReferenceSelections = { main: null };

        const out = getInsdcAccessionsFromSegmentReferences(SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES, selected);

        expect(out).toEqual([{ name: 'main', insdcAccessionFull: 'defaultInsdcAccession' }]);
    });

    it('multi segment + single reference per segment: returns both accessions even if selection is null', () => {
        const selected: SegmentReferenceSelections = { S: null, L: null };

        const out = getInsdcAccessionsFromSegmentReferences(MULTI_SEG_SINGLE_REF_REFERENCEGENOMES, selected);

        expect(out).toEqual([
            { name: 'S', insdcAccessionFull: 'defaultInsdcAccession1' },
            { name: 'L', insdcAccessionFull: 'defaultInsdcAccession2' },
        ]);
    });

    it('single segment + multiple references: uses selected reference accession', () => {
        const selected: SegmentReferenceSelections = { main: 'ref1' };

        const out = getInsdcAccessionsFromSegmentReferences(SINGLE_SEG_MULTI_REF_REFERENCEGENOMES, selected);

        expect(out).toEqual([{ name: 'main', insdcAccessionFull: 'defaultInsdcAccession1' }]);
    });

    it('single segment + multiple references: if selection is null, returns empty list', () => {
        const selected: SegmentReferenceSelections = { main: null };

        const out = getInsdcAccessionsFromSegmentReferences(SINGLE_SEG_MULTI_REF_REFERENCEGENOMES, selected);

        expect(out).toEqual([]);
    });

    it('omits insdcAccessionFull field when it is null', () => {
        const info = structuredClone(SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES);
        info.segmentReferenceGenomes.main.singleReference.insdcAccessionFull = null;

        const selected: SegmentReferenceSelections = { main: null };

        const out = getInsdcAccessionsFromSegmentReferences(info, selected);

        expect(out).toEqual([{ name: 'main' }]); // no insdcAccessionFull key
    });
});

describe('lapisNameToDisplayName', () => {
    it('single-segmented: segment lapisNames map to undefined; gene lapisNames map to gene names', () => {
        const map = lapisNameToDisplayName(SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES);

        expect(map.get('main')).toBeUndefined();
        expect(map.get('gene1')).toBe('gene1');
        expect(map.get('gene2')).toBe('gene2');
    });

    it('multi-segmented: segment lapisNames map to segment display name; gene lapisNames map to gene names', () => {
        const map = lapisNameToDisplayName(MULTI_SEG_SINGLE_REF_REFERENCEGENOMES);

        expect(map.get('S')).toBe('S');
        expect(map.get('L')).toBe('L');

        expect(map.get('gene1')).toBe('gene1');
        expect(map.get('gene2')).toBe('gene2');
    });

    it('multi-reference (single segment): reference lapisNames map to undefined; gene lapisNames map to gene names', () => {
        const map = lapisNameToDisplayName(SINGLE_SEG_MULTI_REF_REFERENCEGENOMES);

        expect(map.get('ref1')).toBeUndefined();
        expect(map.get('ref2')).toBeUndefined();

        expect(map.get('gene1-ref1')).toBe('gene1');
        expect(map.get('gene2-ref1')).toBe('gene2');
        expect(map.get('gene1-ref2')).toBe('gene1');
        expect(map.get('gene2-ref2')).toBe('gene2');
    });
});

describe('segmentsWithMultipleReferences', () => {
    it('returns [] when no segment has multiple references', () => {
        expect(segmentsWithMultipleReferences(SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES)).toEqual([]);
        expect(segmentsWithMultipleReferences(MULTI_SEG_SINGLE_REF_REFERENCEGENOMES)).toEqual([]);
    });

    it('returns segments that have multiple references', () => {
        expect(segmentsWithMultipleReferences(SINGLE_SEG_MULTI_REF_REFERENCEGENOMES)).toEqual(['main']);
    });
});

describe('allReferencesSelected', () => {
    it('false when there are no multi-reference segments', () => {
        expect(allReferencesSelected(SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES, { main: null })).toBe(true);

        expect(allReferencesSelected(MULTI_SEG_SINGLE_REF_REFERENCEGENOMES, { S: null, L: null })).toBe(true);
    });

    it('true when a multi-reference segment has null selection', () => {
        expect(allReferencesSelected(SINGLE_SEG_MULTI_REF_REFERENCEGENOMES, { main: null })).toBe(false);
    });

    it('false when all multi-reference segments have a selection', () => {
        expect(allReferencesSelected(SINGLE_SEG_MULTI_REF_REFERENCEGENOMES, { main: 'ref1' })).toBe(true);
    });
});
