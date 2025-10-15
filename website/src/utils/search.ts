import { sentenceCase } from 'change-case';

import { validateSingleValue } from './extractFieldValue';
import type { TableSequenceData } from '../components/SearchPage/Table';
import type { QueryState } from '../components/SearchPage/useQueryAsState.ts';
import type {
    FieldValues,
    GroupedMetadataFilter,
    Metadata,
    MetadataFilter,
    MetadataType,
    Schema,
} from '../types/config';

export const VISIBILITY_PREFIX = 'visibility_';

export const COLUMN_VISIBILITY_PREFIX = 'column_';

export const ORDER_KEY = 'orderBy';
export const ORDER_DIRECTION_KEY = 'order';
export const PAGE_KEY = 'page';
export const NULL_QUERY_VALUE = '_null_';

export type SearchResponse = {
    data: TableSequenceData[];
    totalCount: number;
};

type InitialVisibilityAccessor = (field: MetadataFilter) => boolean;
type VisiblitySelectableAccessor = (field: MetadataFilter) => boolean;

const getFieldOrColumnVisibilitiesFromQuery = (
    schema: Schema,
    state: QueryState,
    visibilityPrefix: string,
    initiallyVisibleAccessor: InitialVisibilityAccessor,
    visibilitySelectableAccessor: VisiblitySelectableAccessor,
): Map<string, boolean> => {
    const visibilities = new Map<string, boolean>();
    schema.metadata.forEach((field) => {
        if (!visibilitySelectableAccessor(field)) {
            return;
        }

        let fieldName = field.name;

        if (field.rangeOverlapSearch) {
            fieldName = field.rangeOverlapSearch.rangeName;
        }
        visibilities.set(fieldName, initiallyVisibleAccessor(field));
    });

    const visibilityKeys = Object.keys(state).filter((key) => key.startsWith(visibilityPrefix));

    for (const key of visibilityKeys) {
        // Visibility values must always be single strings
        const stringValue = validateSingleValue(state[key], key);
        visibilities.set(key.slice(visibilityPrefix.length), stringValue === 'true');
    }
    return visibilities;
};

export const getFieldVisibilitiesFromQuery = (schema: Schema, state: QueryState): Map<string, boolean> => {
    const initiallyVisibleAccessor: InitialVisibilityAccessor = (field) => field.initiallyVisible === true;
    const isFieldSelectable: VisiblitySelectableAccessor = (field) =>
        field.notSearchable !== true && field.name !== schema.suborganismIdentifierField;
    return getFieldOrColumnVisibilitiesFromQuery(
        schema,
        state,
        VISIBILITY_PREFIX,
        initiallyVisibleAccessor,
        isFieldSelectable,
    );
};

export const getColumnVisibilitiesFromQuery = (schema: Schema, state: QueryState): Map<string, boolean> => {
    const initiallyVisibleAccessor: InitialVisibilityAccessor = (field) => schema.tableColumns.includes(field.name);
    const isFieldSelectable: VisiblitySelectableAccessor = (field) => !(field.hideInSearchResultsTable ?? false);
    return getFieldOrColumnVisibilitiesFromQuery(
        schema,
        state,
        COLUMN_VISIBILITY_PREFIX,
        initiallyVisibleAccessor,
        isFieldSelectable,
    );
};

const getMetadataSchemaWithExpandedRanges = (metadataSchema: Metadata[]): MetadataFilter[] => {
    const result: MetadataFilter[] = [];
    for (const field of metadataSchema) {
        if (field.rangeOverlapSearch) {
            const fieldGroupProps = {
                fieldGroup: field.rangeOverlapSearch.rangeName,
                fieldGroupDisplayName: field.rangeOverlapSearch.rangeDisplayName,
                header: field.header,
            };
            result.push({
                ...field,
                ...fieldGroupProps,
                name: `${field.name}From`,
                displayName: 'From',
            });
            result.push({
                ...field,
                ...fieldGroupProps,
                name: `${field.name}To`,
                displayName: 'To',
            });
        } else if (field.rangeSearch === true) {
            const fromField = {
                ...field,
                name: `${field.name}From`,
                displayName: 'From',
                fieldGroup: field.name,
                fieldGroupDisplayName: field.displayName ?? sentenceCase(field.name),
                header: field.header,
            };
            const toField = {
                ...field,
                name: `${field.name}To`,
                displayName: 'To',
                fieldGroup: field.name,
                fieldGroupDisplayName: field.displayName ?? sentenceCase(field.name),
                header: field.header,
            };
            result.push(fromField);
            result.push(toField);
        } else {
            result.push(field);
        }
    }
    return result;
};

const consolidateGroupedFields = (filters: MetadataFilter[]): (MetadataFilter | GroupedMetadataFilter)[] => {
    const fieldList: (MetadataFilter | GroupedMetadataFilter)[] = [];
    const groupsMap = new Map<string, GroupedMetadataFilter>();

    for (const filter of filters) {
        if (filter.fieldGroup !== undefined) {
            if (!groupsMap.has(filter.fieldGroup)) {
                const fieldForGroup: GroupedMetadataFilter = {
                    name: filter.fieldGroup,
                    groupedFields: [],
                    type: filter.type,
                    grouped: true,
                    displayName: filter.fieldGroupDisplayName,
                    initiallyVisible: filter.initiallyVisible,
                    header: filter.header,
                };
                fieldList.push(fieldForGroup);
                groupsMap.set(filter.fieldGroup, fieldForGroup);
            }
            groupsMap.get(filter.fieldGroup)!.groupedFields.push(filter);
        } else {
            fieldList.push(filter);
        }
    }
    return fieldList;
};

/**
 * Derives from the Metadata schema. For some metadata fields, they are expanded into multiple
 * (grouped) filters.
 */
export class MetadataFilterSchema {
    public readonly filters: (MetadataFilter | GroupedMetadataFilter)[];

    constructor(metadataSchema: Metadata[]) {
        const expandedFilters = getMetadataSchemaWithExpandedRanges(metadataSchema);
        this.filters = consolidateGroupedFields(expandedFilters);
    }

    private ungroupedMetadataFilters(): MetadataFilter[] {
        return this.filters.flatMap((filter) => (filter.grouped ? filter.groupedFields : filter));
    }

    public getMultiEntryFieldNames(): string[] {
        return this.ungroupedMetadataFilters()
            .filter((metadataFilter) => metadataFilter.multiEntryTextSearch === true)
            .map((metadataFilter) => metadataFilter.name);
    }

    public getType(fieldName: string): MetadataType | undefined {
        return this.ungroupedMetadataFilters().find((metadataFilter) => metadataFilter.name === fieldName)?.type;
    }

    /**
     * Get the display name for simple metadata fields, or displayname + sub label for
     * ranges, i.e. "released at - from" (<displayname> - <label>)
     */
    public getLabel(fieldName: string): string {
        let displayName = this.filters
            .map((metadata) => {
                if (metadata.grouped === true) {
                    const groupedField = metadata.groupedFields.find(
                        (groupedMetadata) => groupedMetadata.name === fieldName,
                    );
                    if (groupedField) {
                        return `${metadata.displayName} - ${groupedField.displayName}`;
                    }
                }
            })
            .find((x) => x !== undefined);
        displayName ??= this.filters.find((metadata) => metadata.name === fieldName)?.displayName;
        return displayName ?? fieldName;
    }

    public isSubstringSearchEnabled(fieldName: string): boolean {
        return (
            this.ungroupedMetadataFilters().find((metadataFilter) => metadataFilter.name === fieldName)
                ?.substringSearch === true
        );
    }

    public filterNameToLabelMap(): Record<string, string> {
        return this.filters.reduce(
            (acc, field) => {
                acc[field.name] = field.displayName ?? sentenceCase(field.name);
                return acc;
            },
            {} as Record<string, string>,
        );
    }

    /**
     * @param queryState the key-values set in the URL.
     * @param hiddenFieldValues The default settings to use for all {@link FieldValues} as a starting point.
     */
    public getFieldValuesFromQuery(queryState: QueryState, hiddenFieldValues: FieldValues): FieldValues {
        const values: FieldValues = { ...hiddenFieldValues };
        const multiEntryFields = new Set(this.getMultiEntryFieldNames());
        for (const field of this.ungroupedMetadataFilters()) {
            const value = queryState[field.name];
            if (value === undefined) {
                continue;
            }
            if (multiEntryFields.has(field.name)) {
                const stringValue = validateSingleValue(value, field.name);
                if (stringValue === '') {
                    delete (values as Record<string, unknown>)[field.name];
                } else {
                    values[field.name] = stringValue;
                }
                continue;
            }
            // Handle arrays (multi-select) and single values
            if (Array.isArray(value)) {
                values[field.name] = value.map((v) => (v === NULL_QUERY_VALUE ? null : v));
            } else {
                values[field.name] = value === NULL_QUERY_VALUE ? null : value;
            }
        }
        if ('mutation' in queryState) {
            const val = validateSingleValue(queryState.mutation, 'mutation');
            values.mutation = val === '' ? undefined : val;
        }
        return values;
    }
}
