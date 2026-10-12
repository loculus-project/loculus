import type { TableDataEntry } from './types';
import type { MetadataField, MetadataRecord } from '../../types/backend';
import type { Metadata } from '../../types/config';
import { parseUnixTimestamp } from '../../utils/parseUnixTimestamp';

export function getMetadataTableData(metadata: Metadata[], values: MetadataRecord): TableDataEntry[] {
    return metadata
        .filter((field) => field.hideOnSequenceDetailsPage !== true)
        .filter((field) => values[field.name] !== null && field.name in values)
        .map((field) => ({
            label: field.displayName ?? field.name,
            name: field.name,
            customDisplay: field.customDisplay,
            value: displayedValue(values[field.name], field),
            header: field.header ?? '',
            type: { kind: 'metadata', metadataType: field.type },
            orderOnDetailsPage: field.orderOnDetailsPage,
        }));
}

function displayedValue(value: MetadataField | undefined, metadata: Metadata) {
    if (value === null || value === undefined) return 'N/A';
    if (metadata.type === 'timestamp' && typeof value === 'number') return parseUnixTimestamp(value);
    return value instanceof Date ? value.toISOString() : value;
}
