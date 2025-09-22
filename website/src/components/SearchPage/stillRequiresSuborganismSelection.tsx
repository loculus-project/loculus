import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';

export function stillRequiresSuborganismSelection(
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames,
    selectedSuborganism: string | null,
) {
    return Object.keys(referenceGenomesSequenceNames).length > 1 && selectedSuborganism === null;
}
