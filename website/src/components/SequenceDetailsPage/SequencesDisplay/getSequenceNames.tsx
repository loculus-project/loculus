import { type ReferenceGenomesLightweightSchema, SINGLE_REFERENCE } from '../../../types/referencesGenomes.ts';
import {
    getMultiPathogenNucleotideSequenceNames,
    getMultiPathogenSequenceName,
    getSinglePathogenSequenceName,
    isMultiSegmented,
    type SequenceName,
} from '../../../utils/sequenceTypeHelpers.ts';

export function getSequenceNames(
    referenceGenomeSequenceNames: ReferenceGenomesLightweightSchema,
    suborganism: string,
): {
    nucleotideSegmentNames: SequenceName[];
    geneNames: SequenceName[];
    isMultiSegmented: boolean;
} {
    const { nucleotideSegmentNames, geneNames } = referenceGenomeSequenceNames[suborganism];

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
