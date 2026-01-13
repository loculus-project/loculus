import { type ReferenceGenomesMap } from '../../types/referencesGenomes.ts';

export function getSegmentAndGeneDisplayNameMap(referenceGenomesMap: ReferenceGenomesMap): Map<string, string | null> {
    const mappingEntries: [string, string][] = [];
    const multiSegmented = Object.keys(referenceGenomesMap).length > 1;

    // Iterate through all segments and references
    for (const [segmentName, references] of Object.entries(referenceGenomesMap)) {
        // If only one reference, no prefix needed
        if (Object.keys(references).length === 1) {
            mappingEntries.push([segmentName, segmentName]);

            for (const referenceName of Object.keys(references)) {
                const genes = references[referenceName].genes ?? {};
                for (const geneName of Object.keys(genes)) {
                    mappingEntries.push([geneName, geneName]);
                }
            }
        } else {
            // Multiple references: use {segment}-{reference} format
            for (const referenceName of Object.keys(references)) {
                const lapisSegmentName = multiSegmented ? `${segmentName}-${referenceName}` : referenceName;
                mappingEntries.push([lapisSegmentName, segmentName]);

                // Add genes for this segment/reference
                const genes = references[referenceName].genes ?? {};
                for (const geneName of Object.keys(genes)) {
                    const lapisGeneName = `${geneName}-${referenceName}`;
                    mappingEntries.push([lapisGeneName, geneName]);
                }
            }
        }
    }

    return new Map(mappingEntries);
}
