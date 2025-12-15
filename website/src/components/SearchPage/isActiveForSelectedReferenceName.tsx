import type { Metadata } from '../../types/config.ts';

export function isActiveForSelectedReferenceName(selectedReferenceName: string | null, field: Metadata) {
    // Check legacy onlyForReferenceName field
    const matchesReferenceName =
        selectedReferenceName === null ||
        field.onlyForReferenceName === undefined ||
        field.onlyForReferenceName === selectedReferenceName;

    // Check new onlyForReference field (backward compatible)
    const matchesReference =
        selectedReferenceName === null ||
        field.onlyForReference === undefined ||
        field.onlyForReference === selectedReferenceName;

    return matchesReferenceName && matchesReference;
}
