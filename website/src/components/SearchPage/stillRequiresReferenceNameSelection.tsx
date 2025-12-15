import type { ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes.ts';

export function stillRequiresReferenceNameSelection(
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
    selectedReferenceName: string | null,
) {
    // Check if there are multiple references in any segment
    const hasMultipleReferences = Object.values(referenceGenomeLightweightSchema.segments).some(
        (segmentData) => segmentData.references.length > 1,
    );
    return hasMultipleReferences && selectedReferenceName === null;
}
