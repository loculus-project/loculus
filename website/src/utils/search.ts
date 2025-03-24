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
        if (field.hideOnSequenceDetailsPage === true || !visibilitySelectableAccessor(field)) {
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

/**
 * Derives from the Metadata schema. For some metadata fields, they are expanded into multiple
 * (grouped) filters.
 */
export class FilterSchema {
    public readonly fieldList: (MetadataFilter | GroupedMetadataFilter)[] = [];

    constructor(metadataSchema: Metadata[]) {
        for (const field of metadataSchema) {
            if (field.rangeOverlapSearch || field.rangeSearch === true) {
                let fieldsToAdd: MetadataFilter[] = [];

                if (field.rangeOverlapSearch) {
                    const fieldGroupProps = {
                        fieldGroup: field.rangeOverlapSearch.rangeName,
                        fieldGroupDisplayName: field.rangeOverlapSearch.rangeDisplayName,
                    };
                    fieldsToAdd = [
                        { ...field, ...fieldGroupProps, name: `${field.name}From`, label: 'From' },
                        { ...field, ...fieldGroupProps, name: `${field.name}To`, label: 'To' },
                    ];
                } else if (field.rangeSearch === true) {
                    const fieldGroupProps = {
                        fieldGroup: field.name,
                        fieldGroupDisplayName: field.displayName ?? sentenceCase(field.name),
                    };
                    fieldsToAdd = [
                        { ...field, ...fieldGroupProps, name: `${field.name}From`, label: 'From' },
                        { ...field, ...fieldGroupProps, name: `${field.name}To`, label: 'To' },
                    ];
                }

                const fieldForGroup: GroupedMetadataFilter = {
                    name: fieldsToAdd[0].fieldGroup!,
                    groupedFields: fieldsToAdd,
                    type: fieldsToAdd[0].type,
                    grouped: true,
                    displayName: fieldsToAdd[0].fieldGroupDisplayName,
                    label: fieldsToAdd[0].label,
                    initiallyVisible: fieldsToAdd[0].initiallyVisible,
                };
                this.fieldList.push(fieldForGroup);
            } else {
                this.fieldList.push(field);
            }
        }
    }

    private ungroupedMetadataFilters(): MetadataFilter[] {
        return this.fieldList.flatMap((filter) => (filter.grouped ? filter.groupedFields : filter));
    }

    public getType(fieldName: string): MetadataType | undefined {
        return this.ungroupedMetadataFilters().find((metadataFilter) => metadataFilter.name === fieldName)?.type;
    }

    public getLabel(fieldName: string): string {
        let displayName = this.fieldList
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
            displayName = this.fieldList.find((metadata) => metadata.name === fieldName)?.displayName;
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
        return this.fieldList.reduce(
            (acc, field) => {
                acc[field.name] = field.displayName ?? field.label ?? sentenceCase(field.name);
                return acc;
            },
            {} as Record<string, string>,
        );
    }

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
