import { type ReferenceGenomesSequenceNames, SINGLE_REFERENCE } from '../../../types/referencesGenomes.ts';
import type { SequenceName } from '../../../utils/sequenceTypeHelpers.ts';

export function getSequenceNames(
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames,
    suborganism: string,
): {
    nucleotideSegmentNames: SequenceName[];
    genes: SequenceName[];
    isMultiSegmented: boolean;
} {
    const { nucleotideSequences, genes } = referenceGenomeSequenceNames[suborganism];

    if (suborganism === SINGLE_REFERENCE) {
        return {
            nucleotideSegmentNames: nucleotideSequences.map(getSinglePathogenSequenceName),
            genes: genes.map(getSinglePathogenSequenceName),
            isMultiSegmented: isMultiSegmented(nucleotideSequences),
        };
    }

    const nucleotideSegmentNames = getMultiPathogenNucleotideSequenceNames(nucleotideSequences, suborganism);
    return {
        nucleotideSegmentNames,
        genes: genes.map((name) => getMultiPathogenSequenceName(name, suborganism)),
        isMultiSegmented: true, // LAPIS treats the suborganisms as multiple nucleotide segments -> always true
    };
}

export function getMultiPathogenNucleotideSequenceNames(nucleotideSequences: string[], suborganism: string) {
    return nucleotideSequences.length === 1
        ? [{ lapisName: suborganism, label: 'main' }]
        : nucleotideSequences.map((name) => getMultiPathogenSequenceName(name, suborganism));
}

export function getSinglePathogenSequenceName(name: string): SequenceName {
    return {
        lapisName: name,
        label: name,
    };
}

export function getMultiPathogenSequenceName(name: string, suborganism: string): SequenceName {
    return {
        lapisName: `${suborganism}-${name}`,
        label: name,
    };
}

export function isMultiSegmented(nucleotideSegmentNames: unknown[]) {
    return nucleotideSegmentNames.length > 1;
}
