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

export function getSuborganismSegmentAndGeneInfo(
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
    suborganism: string,
): SuborganismSegmentAndGeneInfo {
    const { nucleotideSegmentNames, geneNames } = referenceGenomeLightweightSchema[suborganism];

    if (suborganism === SINGLE_REFERENCE) {
        return {
            nucleotideSegmentInfos: nucleotideSegmentNames.map(getSinglePathogenSequenceName),
            geneInfos: geneNames.map(getSinglePathogenSequenceName),
            isMultiSegmented: isMultiSegmented(nucleotideSegmentNames),
        };
    }

    return {
        nucleotideSegmentInfos: getMultiPathogenNucleotideSequenceNames(nucleotideSegmentNames, suborganism),
        geneInfos: geneNames.map((name) => getMultiPathogenSequenceName(name, suborganism)),
        isMultiSegmented: true, // LAPIS treats the suborganisms as multiple nucleotide segments -> always true
    };
}
