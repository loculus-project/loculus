import type { ComparisonResult, FieldComparison } from './types';
import type { DetailsJson } from '../../types/detailsJson';
import type { TableDataEntry } from '../SequenceDetailsPage/types';

// Fields that are expected to change between versions and should be shown greyed out
const NOISY_FIELD_NAMES = ['submittedAtTimestamp', 'version', 'versionStatus', 'accessionVersion'];
const NOISY_FIELD_PATTERNS = [/timestamp/i, /release.*date/i];

function isNoisyField(fieldName: string): boolean {
    if (NOISY_FIELD_NAMES.includes(fieldName)) {
        return true;
    }
    return NOISY_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName));
}

function compareValues(value1: string | number | boolean, value2: string | number | boolean): boolean {
    return value1 !== value2;
}

export function compareVersionData(v1: DetailsJson, v2: DetailsJson): ComparisonResult {
    const changedFields: FieldComparison[] = [];
    const unchangedFields: FieldComparison[] = [];
    const noisyFields: FieldComparison[] = [];

    // Create a map of fields from version 2 for quick lookup
    const v2FieldMap = new Map<string, TableDataEntry>();
    for (const entry of v2.tableData) {
        v2FieldMap.set(entry.name, entry);
    }

    // Create a set to track which fields we've already processed
    const processedFields = new Set<string>();

    // Process all fields from version 1
    for (const v1Entry of v1.tableData) {
        const v2Entry = v2FieldMap.get(v1Entry.name);

        // If field doesn't exist in v2, consider it as changed (removed)
        if (!v2Entry) {
            const comparison: FieldComparison = {
                name: v1Entry.name,
                label: v1Entry.label,
                header: v1Entry.header,
                value1: v1Entry.value,
                value2: '' as string, // Field doesn't exist in v2
                type: v1Entry.type,
                hasChanged: true,
                isNoisy: isNoisyField(v1Entry.name),
            };

            if (comparison.isNoisy) {
                noisyFields.push(comparison);
            } else {
                changedFields.push(comparison);
            }
        } else {
            // Field exists in both versions
            const hasChanged = compareValues(v1Entry.value, v2Entry.value);
            const isNoisy = isNoisyField(v1Entry.name);

            const comparison: FieldComparison = {
                name: v1Entry.name,
                label: v1Entry.label,
                header: v1Entry.header,
                value1: v1Entry.value,
                value2: v2Entry.value,
                type: v1Entry.type,
                hasChanged,
                isNoisy,
            };

            if (isNoisy) {
                noisyFields.push(comparison);
            } else if (hasChanged) {
                changedFields.push(comparison);
            } else {
                unchangedFields.push(comparison);
            }
        }

        processedFields.add(v1Entry.name);
    }

    // Process fields that only exist in version 2 (added fields)
    for (const v2Entry of v2.tableData) {
        if (!processedFields.has(v2Entry.name)) {
            const comparison: FieldComparison = {
                name: v2Entry.name,
                label: v2Entry.label,
                header: v2Entry.header,
                value1: '' as string, // Field doesn't exist in v1
                value2: v2Entry.value,
                type: v2Entry.type,
                hasChanged: true,
                isNoisy: isNoisyField(v2Entry.name),
            };

            if (comparison.isNoisy) {
                noisyFields.push(comparison);
            } else {
                changedFields.push(comparison);
            }
        }
    }

    return {
        changedFields,
        unchangedFields,
        noisyFields,
    };
}
