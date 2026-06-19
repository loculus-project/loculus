import type { ComparisonResult, FieldComparison } from './types';
import type { DetailsJson } from '../../types/detailsJson';
import type { TableDataEntry } from '../SequenceDetailsPage/types';

// Fields that are expected to change between versions and should be shown greyed out
const NOISY_FIELD_NAMES = [
    'submittedAtTimestamp',
    'releasedAtTimestamp',
    'version',
    'versionStatus',
    'accessionVersion',
];

const NOISY_FIELD_PATTERNS: RegExp[] = [];

// Fields that should never be shown in the diff and are dropped entirely
const HIDDEN_FIELD_NAMES: string[] = [];
const HIDDEN_FIELD_PATTERNS: RegExp[] = [
    // data use terms
    /dataUseTerms/,
];

function isNoisyField(fieldName: string): boolean {
    if (NOISY_FIELD_NAMES.includes(fieldName)) {
        return true;
    }
    return NOISY_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName));
}

function isHiddenField(fieldName: string): boolean {
    if (HIDDEN_FIELD_NAMES.includes(fieldName)) {
        return true;
    }
    return HIDDEN_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName));
}

function compareValues(value1: string | number | boolean, value2: string | number | boolean): boolean {
    return value1 !== value2;
}

export function compareVersionData(v1: DetailsJson, v2: DetailsJson): ComparisonResult {
    const changedFields: FieldComparison[] = [];
    const unchangedFields: FieldComparison[] = [];
    const noisyFields: FieldComparison[] = [];

    // Drop hidden fields up front so neither pass below ever has to consider them.
    const v1Fields = v1.tableData.filter((entry) => !isHiddenField(entry.name));
    const v2Fields = v2.tableData.filter((entry) => !isHiddenField(entry.name));

    // Create a map of fields from version 2 for quick lookup
    const v2FieldMap = new Map<string, TableDataEntry>();
    for (const entry of v2Fields) {
        v2FieldMap.set(entry.name, entry);
    }

    // Create a set to track which fields we've already processed
    const processedFields = new Set<string>();

    // Process all fields from version 1
    for (const v1Entry of v1Fields) {
        const v2Entry = v2FieldMap.get(v1Entry.name);

        // If field doesn't exist in v2, consider it as changed (removed)
        if (!v2Entry) {
            const comparison: FieldComparison = {
                name: v1Entry.name,
                label: v1Entry.label,
                header: v1Entry.header,
                value1: v1Entry.value,
                value2: '', // Field doesn't exist in v2
                type: v1Entry.type,
                orderOnDetailsPage: v1Entry.orderOnDetailsPage,
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
                orderOnDetailsPage: v1Entry.orderOnDetailsPage ?? v2Entry.orderOnDetailsPage,
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
    for (const v2Entry of v2Fields) {
        if (!processedFields.has(v2Entry.name)) {
            const comparison: FieldComparison = {
                name: v2Entry.name,
                label: v2Entry.label,
                header: v2Entry.header,
                value1: '', // Field doesn't exist in v1
                value2: v2Entry.value,
                type: v2Entry.type,
                orderOnDetailsPage: v2Entry.orderOnDetailsPage,
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
