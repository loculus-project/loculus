import {
    type GeneInfo,
    getMultiPathogenNucleotideSequenceNames,
    getMultiPathogenSequenceName,
    getSinglePathogenSequenceName,
    isMultiSegmented,
    type SegmentInfo,
} from './sequenceTypeHelpers.ts';
import { type ReferenceGenomesLightweightSchema, SINGLE_REFERENCE } from '../types/referencesGenomes.ts';

export type SuborganismSegmentAndGeneInfo = {
    nucleotideSegmentInfos: SegmentInfo[];
    geneInfos: GeneInfo[];
    isMultiSegmented: boolean;
};

/**
 * If we know that the suborganism is not null, then the result will also be non-null.
 */
export function getSuborganismSegmentAndGeneInfo(
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
    suborganism: string,
): SuborganismSegmentAndGeneInfo;

export function getSuborganismSegmentAndGeneInfo(
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
    suborganism: string | null,
): SuborganismSegmentAndGeneInfo | null;

export function getSuborganismSegmentAndGeneInfo(
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
    suborganism: string | null,
): SuborganismSegmentAndGeneInfo | null {
    if (SINGLE_REFERENCE in referenceGenomeLightweightSchema) {
        const { nucleotideSegmentNames, geneNames } = referenceGenomeLightweightSchema[SINGLE_REFERENCE];
        return {
            nucleotideSegmentInfos: nucleotideSegmentNames.map(getSinglePathogenSequenceName),
            geneInfos: geneNames.map(getSinglePathogenSequenceName),
            isMultiSegmented: isMultiSegmented(nucleotideSegmentNames),
        };
    }

    if (suborganism === null || !(suborganism in referenceGenomeLightweightSchema)) {
        return null;
    }

    const { nucleotideSegmentNames, geneNames } = referenceGenomeLightweightSchema[suborganism];

    return {
        nucleotideSegmentInfos: getMultiPathogenNucleotideSequenceNames(nucleotideSegmentNames, suborganism),
        geneInfos: geneNames.map((name) => getMultiPathogenSequenceName(name, suborganism)),
        isMultiSegmented: true, // LAPIS treats the suborganisms as multiple nucleotide segments -> always true
    };
}
