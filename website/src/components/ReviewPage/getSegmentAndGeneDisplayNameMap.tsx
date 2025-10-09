import { type ReferenceGenomesLightweightSchema, SINGLE_REFERENCE } from '../../types/referencesGenomes.ts';
import {
    getMultiPathogenNucleotideSequenceNames,
    getMultiPathogenSequenceName,
} from '../../utils/sequenceTypeHelpers.ts';

export function getSegmentAndGeneDisplayNameMap(
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
): Map<string, string | null> {
    if (SINGLE_REFERENCE in referenceGenomeLightweightSchema) {
        return new Map();
    }

    const segmentMappingEntries = Object.entries(referenceGenomeLightweightSchema).flatMap(
        ([suborganism, suborganismSchema]) =>
            getMultiPathogenNucleotideSequenceNames(suborganismSchema.nucleotideSegmentNames, suborganism).map(
                ({ lapisName, label }) => [lapisName, label] as const,
            ),
    );

    const geneMappingEntries = Object.entries(referenceGenomeLightweightSchema).flatMap(
        ([suborganism, suborganismSchema]) =>
            suborganismSchema.geneNames
                .map((geneName) => getMultiPathogenSequenceName(geneName, suborganism))
                .map(({ lapisName, label }) => [lapisName, label] as const),
    );

    return new Map([...segmentMappingEntries, ...geneMappingEntries]);
}
