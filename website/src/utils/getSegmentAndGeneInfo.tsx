import {
    type GeneInfo,
    type SegmentInfo,
    getSegmentInfoWithReference,
    getGeneInfoWithReference,
    type SegmentReferenceSelections,
} from './sequenceTypeHelpers.ts';
import { type ReferenceGenomesMap } from '../types/referencesGenomes.ts';

export type SegmentAndGeneInfo = {
    nucleotideSegmentInfos: SegmentInfo[];
    geneInfos: GeneInfo[];
    isMultiSegmented: boolean;
};

//This is basically a duplication of getSequenceNames - it should also be deleted

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
    let isMultiSegmented = Object.keys(referenceGenomes).length > 1;

    for (const [segmentName, segmentData] of Object.entries(referenceGenomes)) {
        const isSingleReference = Object.keys(segmentData).length === 1;
        const selectedRef = selectedReferences[segmentName] ?? null;

        const refForNaming = isSingleReference ? null : selectedRef;

        nucleotideSegmentInfos.push(getSegmentInfoWithReference(segmentName, refForNaming, !isMultiSegmented));
        if (!isSingleReference) {
            isMultiSegmented = true;
        }

        if (selectedRef && segmentData[selectedRef].genes) {
            const geneNames = Object.keys(segmentData[selectedRef].genes);
            for (const geneName of geneNames) {
                geneInfos.push(getGeneInfoWithReference(geneName, refForNaming));
            }
        }
        else if (isSingleReference) {
            const geneNames = Object.keys(segmentData[Object.keys(segmentData)[0]].genes ?? {});
            for (const geneName of geneNames) {
                geneInfos.push(getGeneInfoWithReference(geneName, null));
            }
        }
    }

    return {
        nucleotideSegmentInfos,
        geneInfos,
        isMultiSegmented,
    };
}
