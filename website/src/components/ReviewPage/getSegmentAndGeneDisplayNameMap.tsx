import { type ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes.ts';

export function getSegmentAndGeneDisplayNameMap(
    referenceGenomesLightweightSchema: ReferenceGenomesLightweightSchema,
): Map<string, string | null> {
    const mappingEntries: [string, string][] = [];

    // Iterate through all segments and references
    for (const [segmentName, segmentData] of Object.entries(referenceGenomesLightweightSchema.segments)) {
        // If only one reference, no prefix needed
        if (segmentData.references.length === 1) {
            // LAPIS name is just the segment name
            mappingEntries.push([segmentName, segmentName]);

            // Add genes for this segment/reference
            const singleRef = segmentData.references[0];
            const genes = segmentData.genesByReference[singleRef];
            for (const geneName of genes) {
                mappingEntries.push([geneName, geneName]);
            }
        } else {
            // Multiple references: use {reference}-{segment} format
            for (const referenceName of segmentData.references) {
                const lapisSegmentName = `${referenceName}-${segmentName}`;
                mappingEntries.push([lapisSegmentName, segmentName]);

                // Add genes for this segment/reference
                const genes = segmentData.genesByReference[referenceName];
                for (const geneName of genes) {
                    const lapisGeneName = `${referenceName}-${geneName}`;
                    mappingEntries.push([lapisGeneName, geneName]);
                }
            }
        }
    }

    return new Map(mappingEntries);
}
