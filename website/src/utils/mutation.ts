import type { BaseType } from './sequenceTypeHelpers';
import { getFirstSequenceNames, type ReferenceGenomesLightweightSchema } from '../types/referencesGenomes';

export type MutationType = 'substitutionOrDeletion' | 'insertion';

export type MutationQuery = {
    baseType: BaseType;
    mutationType: MutationType;
    text: string;
};

export type MutationSearchParams = {
    nucleotideMutations: string[];
    aminoAcidMutations: string[];
    nucleotideInsertions: string[];
    aminoAcidInsertions: string[];
};

export const removeMutationQueries = (
    mutations: string,
    referenceGenomesSequenceNames: ReferenceGenomesLightweightSchema,
    baseType: BaseType,
    mutationType: MutationType,
): string => {
    const mutationQueries = parseMutationsString(mutations, referenceGenomesSequenceNames);
    const filteredMutationQueries = mutationQueries.filter(
        (mq) => !(mq.baseType === baseType && mq.mutationType === mutationType),
    );
    return serializeMutationQueries(filteredMutationQueries);
};

export const parseMutationsString = (
    value: string,
    referenceGenomesSequenceNames: ReferenceGenomesLightweightSchema,
): MutationQuery[] => {
    return value
        .split(',')
        .map((mutation) => parseMutationString(mutation.trim(), referenceGenomesSequenceNames))
        .filter(Boolean) as MutationQuery[];
};

/**
 * Turn a mutation string such as 'A23T' into a {@link MutationQuery} object.
 * Can return `undefined` if the string cannot be parsed into a valid mutation query.
 */
export const parseMutationString = (
    mutation: string,
    referenceGenomesSequenceNames: ReferenceGenomesLightweightSchema,
): MutationQuery | undefined => {
    const tests = [
        { baseType: 'nucleotide', mutationType: 'substitutionOrDeletion', test: isValidNucleotideMutationQuery },
        { baseType: 'aminoAcid', mutationType: 'substitutionOrDeletion', test: isValidAminoAcidMutationQuery },
        { baseType: 'nucleotide', mutationType: 'insertion', test: isValidNucleotideInsertionQuery },
        { baseType: 'aminoAcid', mutationType: 'insertion', test: isValidAminoAcidInsertionQuery },
    ] as const;

    for (const { baseType, mutationType, test } of tests) {
        if (test(mutation, referenceGenomesSequenceNames)) {
            return { baseType, mutationType, text: mutation };
        }
    }
};

export const serializeMutationQueries = (selectedOptions: MutationQuery[]): string => {
    return selectedOptions.map((option) => option.text).join(', ');
};

export const intoMutationSearchParams = (
    mutation: string | undefined,
    referenceGenomesSequenceNames: ReferenceGenomesLightweightSchema,
): MutationSearchParams => {
    const mutationFilter = parseMutationsString(mutation ?? '', referenceGenomesSequenceNames);

    return {
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

const isValidAminoAcidInsertionQuery = (
    text: string,
    referenceGenomesSequenceNames_: ReferenceGenomesLightweightSchema,
): boolean => {
    try {
        // TODO(#3984) make it multi pathogen aware
        const referenceGenomesSequenceNames = getFirstSequenceNames(referenceGenomesSequenceNames_);
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

const isValidAminoAcidMutationQuery = (
    text: string,
    referenceGenomesSequenceNames_: ReferenceGenomesLightweightSchema,
): boolean => {
    try {
        // TODO(#3984) make it multi pathogen aware
        const referenceGenomesSequenceNames = getFirstSequenceNames(referenceGenomesSequenceNames_);
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

const isValidNucleotideInsertionQuery = (
    text: string,
    referenceGenomesSequenceNames_: ReferenceGenomesLightweightSchema,
): boolean => {
    try {
        // TODO(#3984) make it multi pathogen aware
        const referenceGenomesSequenceNames = getFirstSequenceNames(referenceGenomesSequenceNames_);
        const isMultiSegmented = referenceGenomesSequenceNames.nucleotideSegmentNames.length > 1;
        const textUpper = text.toUpperCase();
        if (!textUpper.startsWith('INS_')) {
            return false;
        }
        const query = textUpper.slice(4);
        const split = query.split(':');
        if ((!isMultiSegmented && split.length > 2) || (isMultiSegmented && split.length > 3)) {
            return false;
        }
        const [segment, position, insertion] = isMultiSegmented
            ? split
            : ([undefined, ...split] as [undefined | string, string, string]);
        if (segment !== undefined) {
            const existingSegments = new Set(
                referenceGenomesSequenceNames.nucleotideSegmentNames.map((n) => n.toUpperCase()),
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

const isValidNucleotideMutationQuery = (
    text: string,
    referenceGenomesSequenceNames_: ReferenceGenomesLightweightSchema,
): boolean => {
    try {
        // TODO(#3984) make it multi pathogen aware
        const referenceGenomesSequenceNames = getFirstSequenceNames(referenceGenomesSequenceNames_);
        const isMultiSegmented = referenceGenomesSequenceNames.nucleotideSegmentNames.length > 1;
        const textUpper = text.toUpperCase();
        let mutation = textUpper;
        if (isMultiSegmented) {
            const [segment, _mutation] = textUpper.split(':');
            const existingSegments = new Set(
                referenceGenomesSequenceNames.nucleotideSegmentNames.map((n) => n.toUpperCase()),
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
