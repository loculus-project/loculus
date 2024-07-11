import type { TableSequenceData } from '../components/SearchPage/Table';
import { parseMutationString } from '../components/SearchPage/fields/MutationField';
import { getReferenceGenomes } from '../config';
import type { MetadataFilter, Schema } from '../types/config';
import type { ReferenceGenomesSequenceNames, ReferenceAccession, NamedSequence } from '../types/referencesGenomes';

export const VISIBILITY_PREFIX = 'visibility_';

export const COLUMN_VISIBILITY_PREFIX = 'column_';

const ORDER_KEY = 'orderBy';
const ORDER_DIRECTION_KEY = 'order';

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
        insdc_accession_full: n.insdc_accession_full,
    };
};

export const getReferenceGenomesSequenceNames = (organism: string): ReferenceGenomesSequenceNames => {
    const referenceGenomes = getReferenceGenomes(organism);
    return {
        nucleotideSequences: referenceGenomes.nucleotideSequences.map((n) => n.name),
        genes: referenceGenomes.genes.map((n) => n.name),
        insdc_accession_full: referenceGenomes.nucleotideSequences.map((n) => getAccession(n)),
    };
};

type VisibilityAccessor = (field: MetadataFilter) => boolean;

const getFieldOrColumnVisibilitiesFromQuery = (
    schema: Schema,
    state: Record<string, string>,
    visibilityPrefix: string,
    initiallyVisibleAccessor: VisibilityAccessor,
): Map<string, boolean> => {
    const visibilities = new Map<string, boolean>();
    schema.metadata.forEach((field) => {
        if (field.hideOnSequenceDetailsPage === true) {
            return;
        }
        visibilities.set(field.name, initiallyVisibleAccessor(field) === true);
    });

    const visibilityKeys = Object.keys(state).filter((key) => key.startsWith(visibilityPrefix));

    for (const key of visibilityKeys) {
        visibilities.set(key.slice(visibilityPrefix.length), state[key] === 'true');
    }
    return visibilities;
};

export const getFieldVisibilitiesFromQuery = (schema: Schema, state: Record<string, string>): Map<string, boolean> => {
    const initiallyVisibleAccessor: VisibilityAccessor = (field) => field.initiallyVisible === true;
    return getFieldOrColumnVisibilitiesFromQuery(schema, state, VISIBILITY_PREFIX, initiallyVisibleAccessor);
};

export const getColumnVisibilitiesFromQuery = (schema: Schema, state: Record<string, string>): Map<string, boolean> => {
    const initiallyVisibleAccessor: VisibilityAccessor = (field) => schema.tableColumns.includes(field.name);
    return getFieldOrColumnVisibilitiesFromQuery(schema, state, COLUMN_VISIBILITY_PREFIX, initiallyVisibleAccessor);
};

export const getFieldValuesFromQuery = (
    state: Record<string, string>,
    hiddenFieldValues: Record<string, any>,
): Record<string, any> => {
    const fieldKeys = Object.keys(state)
        .filter((key) => !key.startsWith(VISIBILITY_PREFIX) && !key.startsWith(COLUMN_VISIBILITY_PREFIX))
        .filter((key) => key !== ORDER_KEY && key !== ORDER_DIRECTION_KEY);

    const values: Record<string, any> = { ...hiddenFieldValues };
    for (const key of fieldKeys) {
        values[key] = state[key];
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

export const getLapisSearchParameters = (
    fieldValues: Record<string, any>,
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames,
): Record<string, any> => {
    const sequenceFilters = Object.fromEntries(
        Object.entries(fieldValues).filter(([, value]) => value !== undefined && value !== ''),
    );

    if (sequenceFilters.accession !== '' && sequenceFilters.accession !== undefined) {
        sequenceFilters.accession = textAccessionsToList(sequenceFilters.accession);
    }

    delete sequenceFilters.mutation;

    const mutationFilter = parseMutationString(fieldValues.mutation ?? '', referenceGenomesSequenceNames);

    return {
        ...sequenceFilters,
        nucleotideMutations: mutationFilter
            .filter((m) => m.baseType === 'nucleotide' && m.mutationType === 'substitutionOrDeletion')
            .map((m) => m.text),
        aminoAcidMutations: mutationFilter
            .filter((m) => m.baseType === 'aminoAcid' && m.mutationType === 'substitutionOrDeletion')
            .map((m) => m.text),
        nucleotideInsertions: mutationFilter
            .filter((m) => m.baseType === 'nucleotide' && m.mutationType === 'insertion')
            .map((m) => m.text),
        aminoAcidInsertions: mutationFilter
            .filter((m) => m.baseType === 'aminoAcid' && m.mutationType === 'insertion')
            .map((m) => m.text),
    };
};
