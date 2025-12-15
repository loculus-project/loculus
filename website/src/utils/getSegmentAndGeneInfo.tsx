import {
    type GeneInfo,
    type SegmentInfo,
    getSegmentInfoWithReference,
    getGeneInfoWithReference,
    type SegmentReferenceSelections,
} from './sequenceTypeHelpers.ts';
import { type ReferenceGenomesLightweightSchema } from '../types/referencesGenomes.ts';

export type SegmentAndGeneInfo = {
    nucleotideSegmentInfos: SegmentInfo[];
    geneInfos: GeneInfo[];
    isMultiSegmented: boolean;
};

/**
 * Get segment and gene info where each segment can have its own reference.
 * @param schema - The reference genome lightweight schema
 * @param selectedReferences - Map of segment names to selected references
 * @returns SegmentAndGeneInfo with all segments and their genes
 */
export function getSegmentAndGeneInfo(
    schema: ReferenceGenomesLightweightSchema,
    selectedReferences: SegmentReferenceSelections,
): SegmentAndGeneInfo {
    const nucleotideSegmentInfos: SegmentInfo[] = [];
    const geneInfos: GeneInfo[] = [];

    // Check if this is single-reference mode (all segments have only one reference)
    const segments = Object.values(schema.segments);
    const isSingleReference = segments.every((segmentData) => segmentData.references.length === 1);

    // Process each segment
    for (const [segmentName, segmentData] of Object.entries(schema.segments)) {
        const selectedRef = selectedReferences[segmentName] ?? null;

        // In single-reference mode, don't prefix segment names
        const refForNaming = isSingleReference ? null : selectedRef;

        // Add nucleotide sequence info for this segment
        nucleotideSegmentInfos.push(getSegmentInfoWithReference(segmentName, refForNaming));

        // Add gene info if reference is selected
        if (selectedRef) {
            const geneNames = segmentData.genesByReference[selectedRef];
            for (const geneName of geneNames) {
                geneInfos.push(getGeneInfoWithReference(geneName, refForNaming));
            }
        }
    }

    return {
        nucleotideSegmentInfos,
        geneInfos,
        isMultiSegmented: Object.keys(schema.segments).length > 1,
    };
}
