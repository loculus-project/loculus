import { sentenceCase } from 'change-case';

import type { TableSequenceData } from '../components/SearchPage/Table';
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

export type SearchResponse = {
    data: TableSequenceData[];
    totalCount: number;
};

type InitialVisibilityAccessor = (field: MetadataFilter) => boolean;
type VisiblitySelectableAccessor = (field: MetadataFilter) => boolean;

const getFieldOrColumnVisibilitiesFromQuery = (
    schema: Schema,
    state: Record<string, string>,
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
        visibilities.set(key.slice(visibilityPrefix.length), state[key] === 'true');
    }
    return visibilities;
};

export const getFieldVisibilitiesFromQuery = (schema: Schema, state: Record<string, string>): Map<string, boolean> => {
    const initiallyVisibleAccessor: InitialVisibilityAccessor = (field) => field.initiallyVisible === true;
    const isFieldSelectable: VisiblitySelectableAccessor = (field) =>
        field.notSearchable !== undefined ? !field.notSearchable : true;
    return getFieldOrColumnVisibilitiesFromQuery(
        schema,
        state,
        VISIBILITY_PREFIX,
        initiallyVisibleAccessor,
        isFieldSelectable,
    );
};

export const getColumnVisibilitiesFromQuery = (schema: Schema, state: Record<string, string>): Map<string, boolean> => {
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
            };
            result.push({
                ...field,
                ...fieldGroupProps,
                name: `${field.name}From`,
                label: 'From',
            });
            result.push({
                ...field,
                ...fieldGroupProps,
                name: `${field.name}To`,
                label: 'To',
            });
        } else if (field.rangeSearch === true) {
            const fromField = {
                ...field,
                name: `${field.name}From`,
                label: 'From',
                fieldGroup: field.name,
                fieldGroupDisplayName: field.displayName ?? sentenceCase(field.name),
            };
            const toField = {
                ...field,
                name: `${field.name}To`,
                label: 'To',
                fieldGroup: field.name,
                fieldGroupDisplayName: field.displayName ?? sentenceCase(field.name),
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
                    label: filter.label,
                    initiallyVisible: filter.initiallyVisible,
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
                        return `${metadata.displayName} - ${groupedField.label}`;
                    }
                }
            })
            .find((x) => x !== undefined);
        if (displayName === undefined) {
            displayName = this.filters.find((metadata) => metadata.name === fieldName)?.displayName;
        }
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
                acc[field.name] = field.displayName ?? field.label ?? sentenceCase(field.name);
                return acc;
            },
            {} as Record<string, string>,
        );
    }

    /**
     * @param queryState the key-values set in the URL.
     * @param hiddenFieldValues The default settings to use for all {@link FieldValues} as a starting point.
     */
    public getFieldValuesFromQuery(queryState: Record<string, string>, hiddenFieldValues: FieldValues): FieldValues {
        const values: FieldValues = { ...hiddenFieldValues };
        for (const field of this.ungroupedMetadataFilters()) {
            if (field.name in queryState) {
                values[field.name] = queryState[field.name];
            }
        }
        if ('accession' in queryState) {
            values.accession = queryState.accession;
        }
        if ('mutation' in queryState) {
            values.mutation = queryState.mutation;
        }
        return values;
    }
}
