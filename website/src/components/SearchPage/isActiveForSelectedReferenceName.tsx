import type { Metadata } from '../../types/config.ts';

export function isActiveForSelectedReferenceName(selectedReferenceNames: Record<string, string | null>, field: Metadata) {
    const matchesReference =
        Object.values(selectedReferenceNames).every((value) => value === null) ||
        field.onlyForReference === undefined ||
        Object.values(selectedReferenceNames).some((value) => value === field.onlyForReference);

    return matchesReference;
}
