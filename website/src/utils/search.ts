import { sentenceCase } from 'change-case';

import type { TableSequenceData } from '../components/SearchPage/Table';
import { getReferenceGenomes } from '../config';
import { intoMutationSearchParams } from './mutation';
import type {
    FieldValues,
    GroupedMetadataFilter,
    Metadata,
    MetadataFilter,
    MetadataType,
    Schema,
} from '../types/config';
import type { ReferenceGenomesSequenceNames, ReferenceAccession, NamedSequence } from '../types/referencesGenomes';

export const VISIBILITY_PREFIX = 'visibility_';

export const COLUMN_VISIBILITY_PREFIX = 'column_';

export const ORDER_KEY = 'orderBy';
export const ORDER_DIRECTION_KEY = 'order';
export const PAGE_KEY = 'page';

export type SearchResponse = {
    data: TableSequenceData[];
    totalCount: number;
};

export function addHiddenFilters(
    searchFormFilter: MetadataFilter[],
    hiddenFilters: MetadataFilter[],
): MetadataFilter[] {
    const searchFormFilterNames = searchFormFilter.map((filter) => filter.name);
    const hiddenFiltersToAdd = hiddenFilters.filter((filter) => !searchFormFilterNames.includes(filter.name));
    return [...searchFormFilter, ...hiddenFiltersToAdd];
}

export const getAccession = (n: NamedSequence): ReferenceAccession => {
    return {
        name: n.name,
        insdcAccessionFull: n.insdcAccessionFull,
    };
};

export const getReferenceGenomesSequenceNames = (organism: string): ReferenceGenomesSequenceNames => {
    const referenceGenomes = getReferenceGenomes(organism);
    return {
        nucleotideSequences: referenceGenomes.nucleotideSequences.map((n) => n.name),
        genes: referenceGenomes.genes.map((n) => n.name),
        insdcAccessionFull: referenceGenomes.nucleotideSequences.map((n) => getAccession(n)),
    };
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

export const getMetadataSchemaWithExpandedRanges = (metadataSchema: Metadata[]): MetadataFilter[] => {
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

/**
 * Derives from the Metadata schema. For some metadata fields, they are expanded into multiple
 * (grouped) filters.
 */
export class FilterSchema {
    public readonly fieldList: (MetadataFilter | GroupedMetadataFilter)[] = [];

    constructor(metadataSchema: Metadata[]) {
        const expandedSchema = getMetadataSchemaWithExpandedRanges(metadataSchema);
        const groupsMap = new Map<string, GroupedMetadataFilter>();

        for (const filter of expandedSchema) {
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
                    this.fieldList.push(fieldForGroup);
                    groupsMap.set(filter.fieldGroup, fieldForGroup);
                }
                groupsMap.get(filter.fieldGroup)!.groupedFields.push(filter);
            } else {
                this.fieldList.push(filter);
            }
        }
    }

    public getType(fieldName: string): MetadataType | undefined {
        return this.fieldList
            .flatMap((metadataFilter) => (metadataFilter.grouped ? metadataFilter.groupedFields : metadataFilter))
            .find((metadataFilter) => metadataFilter.name === fieldName)?.type;
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
            this.fieldList
                .flatMap((metadataFilter) => (metadataFilter.grouped ? metadataFilter.groupedFields : metadataFilter))
                .find((metadataFilter) => metadataFilter.name === fieldName)?.substringSearch === true
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
}

export const getFieldValuesFromQuery = (
    state: Record<string, string>,
    hiddenFieldValues: FieldValues,
    schema: Schema,
): FieldValues => {
    const values: FieldValues = { ...hiddenFieldValues };
    const expandedSchema = getMetadataSchemaWithExpandedRanges(schema.metadata);
    for (const field of expandedSchema) {
        if (field.name in state) {
            values[field.name] = state[field.name];
        }
    }
    if ('accession' in state) {
        values.accession = state.accession;
    }
    if ('mutation' in state) {
        values.mutation = state.mutation;
    }
    return values;
};

const textAccessionsToList = (text: string): string[] => {
    const accessions = text
        .split(/[\t,;\n ]/)
        .map((s) => s.trim())
        .filter((s) => s !== '')
        .map((s) => {
            if (s.includes('.')) {
                return s.split('.')[0];
            }
            return s;
        });

    return accessions;
};

const makeCaseInsensitiveLiteralSubstringRegex = (s: string): string => {
    // takes raw string and escapes all special characters and prefixes (?i) for case insensitivity
    return `(?i)${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
};

/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(#3451) use proper types */
export const getLapisSearchParameters = (
    fieldValues: Record<string, any>,
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames,
    filterSchema: FilterSchema,
): Record<string, any> => {
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const sequenceFilters = Object.fromEntries(
        Object.entries(fieldValues).filter(([, value]) => value !== undefined && value !== ''),
    );
    for (const filterName of Object.keys(sequenceFilters)) {
        if (filterSchema.isSubstringSearchEnabled(filterName) && sequenceFilters[filterName] !== undefined) {
            sequenceFilters[filterName.concat('.regex')] = makeCaseInsensitiveLiteralSubstringRegex(
                sequenceFilters[filterName],
            );
            delete sequenceFilters[filterName];
        }
    }

    if (sequenceFilters.accession !== '' && sequenceFilters.accession !== undefined) {
        sequenceFilters.accession = textAccessionsToList(sequenceFilters.accession);
    }

    delete sequenceFilters.mutation;
    const mutationSearchParams = intoMutationSearchParams(fieldValues.mutation, referenceGenomesSequenceNames);

    return {
        ...sequenceFilters,
        ...mutationSearchParams,
    };
};
