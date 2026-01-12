import type { ReferenceGenomesMap } from '../../types/referencesGenomes.ts';

export function stillRequiresReferenceNameSelection(
    referenceGenomesMap: ReferenceGenomesMap,
    selectedReferenceName: string | null,
) {
    // Check if there are multiple references in any segment
    const hasMultipleReferences = Object.values(referenceGenomesMap.segments).some(
        (segmentData) => segmentData.references.length > 1,
    );
    return hasMultipleReferences && selectedReferenceName === null;
}
