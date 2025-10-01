import { type ReferenceGenomesLightweightSchema, SINGLE_REFERENCE } from '../../../types/referencesGenomes.ts';
import {
    type GeneInfo,
    getMultiPathogenNucleotideSequenceNames,
    getMultiPathogenSequenceName,
    getSinglePathogenSequenceName,
    isMultiSegmented,
    type SegmentInfo,
} from '../../../utils/sequenceTypeHelpers.ts';

export function getSequenceNames(
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
    suborganism: string,
): {
    nucleotideSegmentNames: SegmentInfo[];
    geneNames: GeneInfo[];
    isMultiSegmented: boolean;
} {
    const { nucleotideSegmentNames, geneNames } = referenceGenomeLightweightSchema[suborganism];

    if (suborganism === SINGLE_REFERENCE) {
        return {
            nucleotideSegmentNames: nucleotideSegmentNames.map(getSinglePathogenSequenceName),
            geneNames: geneNames.map(getSinglePathogenSequenceName),
            isMultiSegmented: isMultiSegmented(nucleotideSegmentNames),
        };
    }

    return {
        nucleotideSegmentNames: getMultiPathogenNucleotideSequenceNames(nucleotideSegmentNames, suborganism),
        geneNames: geneNames.map((name) => getMultiPathogenSequenceName(name, suborganism)),
        isMultiSegmented: true, // LAPIS treats the suborganisms as multiple nucleotide segments -> always true
    };
}
