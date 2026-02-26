import { sentenceCase } from 'change-case';

import { validateSingleValue } from './extractFieldValue';
import { getReferenceIdentifier } from './referenceSelection.ts';
import { getSegmentNames, segmentReferenceSelected, type SegmentReferenceSelections } from './sequenceTypeHelpers.ts';
import type { TableSequenceData } from '../components/SearchPage/Table';
import type { QueryState } from '../components/SearchPage/useStateSyncedWithUrlQueryParams.ts';
import type {
    FieldValues,
    GroupedMetadataFilter,
    Metadata,
    MetadataFilter,
    MetadataType,
    Schema,
} from '../types/config';
import type { ReferenceGenomesInfo } from '../types/referencesGenomes.ts';

export const VISIBILITY_PREFIX = 'visibility_';

export const COLUMN_VISIBILITY_PREFIX = 'column_';

export const ORDER_KEY = 'orderBy';
export const ORDER_DIRECTION_KEY = 'order';
export const PAGE_KEY = 'page';
export const NULL_QUERY_VALUE = '_null_';

export const MUTATION_KEY = 'mutation';

// UI-only parameters that don't affect search results
export const SELECTED_SEQ_PARAM = 'selectedSeq';
export const HALF_SCREEN_PARAM = 'halfScreen';

export type SearchResponse = {
    data: TableSequenceData[];
    totalCount: number;
};

type InitialVisibilityAccessor = (field: MetadataFilter) => boolean;
type VisiblitySelectableAccessor = (field: MetadataFilter) => boolean;

export class MetadataVisibility {
    public readonly isChecked: boolean;
    private readonly onlyForReference: string | undefined;
    private readonly segmentName: string | undefined;

    constructor(isChecked: boolean, onlyForReference: string | undefined, segmentName: string | undefined) {
        this.isChecked = isChecked;
        this.onlyForReference = onlyForReference;
        this.segmentName = segmentName;
    }

    public isVisible(
        referenceGenomesInfo: ReferenceGenomesInfo,
        selectedReferenceNames?: SegmentReferenceSelections,
        hideIfStillRequiresReferenceSelection = true,
    ): boolean {
        if (!this.isChecked) {
            return false;
        }
        if (this.onlyForReference == undefined) {
            return true;
        }
        if (selectedReferenceNames === undefined) {
            return false;
        }
        if (
            !hideIfStillRequiresReferenceSelection &&
            !segmentReferenceSelected(this.segmentName!, referenceGenomesInfo, selectedReferenceNames)
        ) {
            return true;
        }
        for (const value of Object.values(selectedReferenceNames)) {
            if (this.onlyForReference === value) {
                return true;
            }
        }
        return false;
    }
}

const getFieldOrColumnVisibilitiesFromQuery = (
    schema: Schema,
    state: QueryState,
    visibilityPrefix: string,
    initiallyVisibleAccessor: InitialVisibilityAccessor,
    visibilitySelectableAccessor: VisiblitySelectableAccessor,
): Map<string, MetadataVisibility> => {
    const explicitVisibilitiesInUrlByFieldName = new Map(
        Object.entries(state)
            .filter(([key]) => key.startsWith(visibilityPrefix))
            .map(([key, value]) => [key.slice(visibilityPrefix.length), validateSingleValue(value, key) === 'true']),
    );

    const visibilities = new Map<string, MetadataVisibility>();
    schema.metadata.forEach((field) => {
        if (!visibilitySelectableAccessor(field)) {
            return;
        }

        let fieldName = field.name;

        if (field.rangeOverlapSearch) {
            fieldName = field.rangeOverlapSearch.rangeName;
        }

        const visibility = new MetadataVisibility(
            explicitVisibilitiesInUrlByFieldName.get(fieldName) ?? initiallyVisibleAccessor(field),
            field.onlyForReference,
            field.relatesToSegment,
        );

        visibilities.set(fieldName, visibility);
    });

    return visibilities;
};

export const getFieldVisibilitiesFromQuery = (schema: Schema, state: QueryState): Map<string, MetadataVisibility> => {
    const initiallyVisibleAccessor: InitialVisibilityAccessor = (field) => field.initiallyVisible === true;
    const isFieldSelectable: VisiblitySelectableAccessor = (field) =>
        field.notSearchable !== true && field.name !== schema.referenceIdentifierField;
    return getFieldOrColumnVisibilitiesFromQuery(
        schema,
        state,
        VISIBILITY_PREFIX,
        initiallyVisibleAccessor,
        isFieldSelectable,
    );
};

export const getColumnVisibilitiesFromQuery = (schema: Schema, state: QueryState): Map<string, MetadataVisibility> => {
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
                    isSequenceFilter: filter.isSequenceFilter,
                    relatesToSegment: filter.relatesToSegment,
                    fieldPresets: filter.fieldPresets,
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
 * Static information, derived from the Metadata schema (from the config).
 * For some metadata fields, they are expanded into multiple (grouped) filters.
 */
export class MetadataFilterSchema {
    public readonly filters: (MetadataFilter | GroupedMetadataFilter)[];

    constructor(metadataSchema: Metadata[]) {
        const expandedFilters = getMetadataSchemaWithExpandedRanges(metadataSchema);
        this.filters = consolidateGroupedFields(expandedFilters);
    }

    public ungroupedMetadataFilters(): MetadataFilter[] {
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
    public getFieldValuesFromQuery(
        queryState: QueryState,
        hiddenFieldValues: FieldValues,
        referenceGenomesInfo: ReferenceGenomesInfo,
    ): FieldValues {
        const values: FieldValues = { ...hiddenFieldValues };
        for (const field of this.ungroupedMetadataFilters()) {
            const value = queryState[field.name];
            if (value === undefined) {
                continue;
            }
            // Handle arrays (multi-select) and single values
            if (Array.isArray(value)) {
                values[field.name] = value.map((v) => (v === NULL_QUERY_VALUE ? null : v));
            } else {
                values[field.name] = value === NULL_QUERY_VALUE ? null : value;
            }
        }
        // Handle special fields - these must be single values
        if ('accession' in queryState) {
            const val = validateSingleValue(queryState.accession, 'accession');
            values.accession = val === '' ? undefined : val;
        }
        for (const segmentName of getSegmentNames(referenceGenomesInfo)) {
            const mutationParamName = getReferenceIdentifier(
                MUTATION_KEY,
                segmentName,
                referenceGenomesInfo.isMultiSegmented,
            );
            if (mutationParamName in queryState) {
                const val = validateSingleValue(queryState[mutationParamName], mutationParamName);
                values[mutationParamName] = val;
            }
        }
        return values;
    }
}
