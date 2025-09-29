import type { ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes.ts';

export function stillRequiresSuborganismSelection(
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
    selectedSuborganism: string | null,
) {
    return Object.keys(referenceGenomeLightweightSchema).length > 1 && selectedSuborganism === null;
}
