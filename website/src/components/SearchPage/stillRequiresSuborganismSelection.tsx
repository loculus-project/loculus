import type { ReferenceGenomesMap } from '../../types/referencesGenomes.ts';

export function stillRequiresReferenceNameSelection(
    referenceGenomesMap: ReferenceGenomesMap,
    selectedReferenceName: string | null,
) {
    return Object.keys(referenceGenomesMap).length > 1 && selectedReferenceName === null;
}
