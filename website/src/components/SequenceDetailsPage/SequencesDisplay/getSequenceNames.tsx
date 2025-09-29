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
    genes: SequenceName[];
    isMultiSegmented: boolean;
} {
    const { nucleotideSegmentNames, genes } = referenceGenomeSequenceNames[suborganism];

    if (suborganism === SINGLE_REFERENCE) {
        return {
            nucleotideSegmentNames: nucleotideSegmentNames.map(getSinglePathogenSequenceName),
            genes: genes.map(getSinglePathogenSequenceName),
            isMultiSegmented: isMultiSegmented(nucleotideSegmentNames),
        };
    }

    return {
        nucleotideSegmentNames: getMultiPathogenNucleotideSequenceNames(nucleotideSegmentNames, suborganism),
        genes: genes.map((name) => getMultiPathogenSequenceName(name, suborganism)),
        isMultiSegmented: true, // LAPIS treats the suborganisms as multiple nucleotide segments -> always true
    };
}
