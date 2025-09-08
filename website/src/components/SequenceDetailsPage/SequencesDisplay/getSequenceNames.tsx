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
            nucleotideSegmentNames: nucleotideSequences.map((name) => ({ lapisName: name, label: name })),
            genes: genes.map((name) => ({ lapisName: name, label: name })),
            isMultiSegmented: isMultiSegmented(nucleotideSequences),
        };
    }

    const nucleotideSegmentNames =
        nucleotideSequences.length === 1
            ? [{ lapisName: suborganism, label: 'main' }]
            : nucleotideSequences.map((name) => ({
                  lapisName: `${suborganism}-${name}`,
                  label: name,
              }));

    return {
        nucleotideSegmentNames,
        genes: genes.map((name) => ({
            lapisName: `${suborganism}-${name}`,
            label: name,
        })),
        isMultiSegmented: true, // LAPIS treats the suborganisms as multiple nucleotide segments -> always true
    };
}

export function isMultiSegmented(nucleotideSegmentNames: unknown[]) {
    return nucleotideSegmentNames.length > 1;
}
