import type { ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes.ts';

export function stillRequiresSuborganismSelection(
    referenceGenomesSequenceNames: ReferenceGenomesLightweightSchema,
    selectedSuborganism: string | null,
) {
    return Object.keys(referenceGenomesSequenceNames).length > 1 && selectedSuborganism === null;
}
