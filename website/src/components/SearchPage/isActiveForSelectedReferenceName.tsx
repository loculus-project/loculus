import type { Metadata } from '../../types/config.ts';
import type { SegmentReferenceSelections } from '../../utils/sequenceTypeHelpers.ts';

export function isActiveForSelectedReferenceName(selectedReferenceNames: SegmentReferenceSelections, field: Metadata) {
    const matchesReference =
        field.onlyForReference === undefined ||
        Object.values(selectedReferenceNames).some((value) => value === field.onlyForReference);

    return matchesReference;
}
