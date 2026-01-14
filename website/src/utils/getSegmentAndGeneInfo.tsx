import {
    type GeneInfo,
    type SegmentInfo,
    getSegmentInfoWithReference,
    getGeneInfoWithReference,
    type SegmentReferenceSelections,
} from './sequenceTypeHelpers.ts';
import {
    type ReferenceGenomesMap,
    getSegmentNames,
    segmentHasMultipleReferences,
} from '../types/referencesGenomes.ts';

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
    referenceGenomes: ReferenceGenomesMap,
    selectedReferences: SegmentReferenceSelections,
): SegmentAndGeneInfo {
    const nucleotideSegmentInfos: SegmentInfo[] = [];
    const geneInfos: GeneInfo[] = [];
    const segments = getSegmentNames(referenceGenomes);
    const isMultiSegmented = segments.length > 1;

    for (const segmentName of segments) {
        const segmentData = referenceGenomes[segmentName];
        const isMultiReference = segmentHasMultipleReferences(referenceGenomes, segmentName);
        const selectedRef = selectedReferences[segmentName] ?? null;

        // For single-reference segments, don't include reference in naming
        const refForNaming = isMultiReference ? selectedRef : null;

        nucleotideSegmentInfos.push(getSegmentInfoWithReference(segmentName, refForNaming));

        if (selectedRef && segmentData[selectedRef]?.genes) {
            const geneNames = Object.keys(segmentData[selectedRef].genes);
            for (const geneName of geneNames) {
                geneInfos.push(getGeneInfoWithReference(geneName, refForNaming));
            }
        }
    }

    return {
        nucleotideSegmentInfos,
        geneInfos,
        isMultiSegmented,
    };
}
