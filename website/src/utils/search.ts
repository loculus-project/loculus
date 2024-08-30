import { sentenceCase } from 'change-case';

import { type BaseType } from './sequenceTypeHelpers';
import type { TableSequenceData } from '../components/SearchPage/Table';
import { getReferenceGenomes } from '../config';
import type { Metadata, MetadataFilter, Schema } from '../types/config';
import type { ReferenceGenomesSequenceNames, ReferenceAccession, NamedSequence } from '../types/referencesGenomes';

export const VISIBILITY_PREFIX = 'visibility_';

export type MutationQuery = {
    baseType: BaseType;
    mutationType: 'substitutionOrDeletion' | 'insertion';
    text: string;
};

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
export const getMetadataSchemaWithExpandedRanges = (metadataSchema: Metadata[]) => {
    const result = [];
    for (const field of metadataSchema) {
        if (field.rangeSearch === true) {
            const fromField = {
                ...field,
                name: `${field.name}From`,
                label: `From`,
                fieldGroup: field.name,
                fieldGroupDisplayName: field.displayName ?? sentenceCase(field.name),
            };
            const toField = {
                ...field,
                name: `${field.name}To`,
                label: `To`,
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

export const getFieldValuesFromQuery = (
    state: Record<string, string>,
    hiddenFieldValues: Record<string, any>,
    schema: Schema,
): Record<string, any> => {
    const values: Record<string, any> = { ...hiddenFieldValues };
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

export const getLapisSearchParameters = (
    fieldValues: Record<string, any>,
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames,
    schema: Schema,
): Record<string, any> => {
    const expandedSchema = getMetadataSchemaWithExpandedRanges(schema.metadata);

    const sequenceFilters = Object.fromEntries(
        Object.entries(fieldValues).filter(([, value]) => value !== undefined && value !== ''),
    );
    for (const field of expandedSchema) {
        if (field.type === 'authors' && sequenceFilters[field.name] !== undefined) {
            sequenceFilters[field.name.concat('.regex')] = makeCaseInsensitiveLiteralSubstringRegex(
                sequenceFilters[field.name],
            );
            delete sequenceFilters[field.name];
        }
    }

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

export const parseMutationString = (
    value: string,
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames,
): MutationQuery[] => {
    return value
        .split(',')
        .map((mutation) => {
            const trimmedMutation = mutation.trim();
            if (isValidNucleotideMutationQuery(trimmedMutation, referenceGenomesSequenceNames)) {
                return { baseType: 'nucleotide', mutationType: 'substitutionOrDeletion', text: trimmedMutation };
            }
            if (isValidAminoAcidMutationQuery(trimmedMutation, referenceGenomesSequenceNames)) {
                return { baseType: 'aminoAcid', mutationType: 'substitutionOrDeletion', text: trimmedMutation };
            }
            if (isValidNucleotideInsertionQuery(trimmedMutation, referenceGenomesSequenceNames)) {
                return { baseType: 'nucleotide', mutationType: 'insertion', text: trimmedMutation };
            }
            if (isValidAminoAcidInsertionQuery(trimmedMutation, referenceGenomesSequenceNames)) {
                return { baseType: 'aminoAcid', mutationType: 'insertion', text: trimmedMutation };
            }
            return null;
        })
        .filter(Boolean) as MutationQuery[];
};

export const isValidAminoAcidInsertionQuery = (
    text: string,
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames,
): boolean => {
    try {
        const textUpper = text.toUpperCase();
        if (!textUpper.startsWith('INS_')) {
            return false;
        }
        const query = textUpper.slice(4);
        const [gene, position, insertion] = query.split(':');
        const existingGenes = new Set(referenceGenomesSequenceNames.genes.map((g) => g.toUpperCase()));
        if (!existingGenes.has(gene) || !Number.isInteger(Number(position))) {
            return false;
        }
        return /^[A-Z*?]+$/.test(insertion);
    } catch (_) {
        return false;
    }
};

export const isValidAminoAcidMutationQuery = (
    text: string,
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames,
): boolean => {
    try {
        const textUpper = text.toUpperCase();
        const [gene, mutation] = textUpper.split(':');
        const existingGenes = new Set(referenceGenomesSequenceNames.genes.map((g) => g.toUpperCase()));
        if (!existingGenes.has(gene)) {
            return false;
        }
        return /^[A-Z*]?[0-9]+[A-Z-*\\.]?$/.test(mutation);
    } catch (_) {
        return false;
    }
};

export const isValidNucleotideInsertionQuery = (
    text: string,
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames,
): boolean => {
    try {
        const isMultiSegmented = referenceGenomesSequenceNames.nucleotideSequences.length > 1;
        const textUpper = text.toUpperCase();
        if (!textUpper.startsWith('INS_')) {
            return false;
        }
        const query = textUpper.slice(4);
        const split = query.split(':');
        const [segment, position, insertion] = isMultiSegmented
            ? split
            : ([undefined, ...split] as [undefined | string, string, string]);
        if (segment !== undefined) {
            const existingSegments = new Set(
                referenceGenomesSequenceNames.nucleotideSequences.map((n) => n.toUpperCase()),
            );
            if (!existingSegments.has(segment)) {
                return false;
            }
        }
        if (!Number.isInteger(Number(position))) {
            return false;
        }
        return /^[A-Z*?]+$/.test(insertion);
    } catch (_) {
        return false;
    }
};

export const isValidNucleotideMutationQuery = (
    text: string,
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames,
): boolean => {
    try {
        const isMultiSegmented = referenceGenomesSequenceNames.nucleotideSequences.length > 1;
        const textUpper = text.toUpperCase();
        let mutation = textUpper;
        if (isMultiSegmented) {
            const [segment, _mutation] = textUpper.split(':');
            const existingSegments = new Set(
                referenceGenomesSequenceNames.nucleotideSequences.map((n) => n.toUpperCase()),
            );
            if (!existingSegments.has(segment)) {
                return false;
            }
            mutation = _mutation;
        }
        return /^[A-Z]?[0-9]+[A-Z-\\.]?$/.test(mutation);
    } catch (_) {
        return false;
    }
};
