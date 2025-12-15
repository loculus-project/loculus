import type { ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes.ts';

export function stillRequiresReferenceNameSelection(
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
    selectedReferenceName: string | null,
) {
    return Object.keys(referenceGenomeLightweightSchema).length > 1 && selectedReferenceName === null;
}
