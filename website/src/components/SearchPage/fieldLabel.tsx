import { sentenceCase } from 'change-case';

import type { MetadataFilter, GroupedMetadataFilter } from '../../types/config';

export function fieldLabel(field: MetadataFilter | GroupedMetadataFilter): string {
    if (field.label !== undefined && field.label.length > 0) {
        return field.label;
    }
    if (field.displayName !== undefined && field.displayName.length > 0) {
        return field.displayName;
    }
    return sentenceCase(field.name);
}
