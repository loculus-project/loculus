import type { BaseType } from './sequenceTypeHelpers';
import type { ReferenceGenomesSequenceNames } from '../types/referencesGenomes';

export type Foo = 'nucleotideMutations' | 'aminoAcidMutations' | 'nucleotideInsertions' | 'aminoAcidInsertions';

export type MutationType = 'substitutionOrDeletion' | 'insertion';

export type MutationQuery = {
    baseType: BaseType;
    mutationType: MutationType;
    text: string;
};

export const removeMutationQueries = (
    mutations: string,
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames,
    baseType: BaseType,
    mutationType: MutationType,
): string => {
    const mutationQueries = parseMutationString(mutations, referenceGenomesSequenceNames);
    const filteredMutationQueries = mutationQueries.filter(
        (mq) => !(mq.baseType === baseType && mq.mutationType === mutationType),
    );
    return serializeMutationQueries(filteredMutationQueries);
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

export const serializeMutationQueries = (selectedOptions: MutationQuery[]): string => {
    return selectedOptions.map((option) => option.text).join(', ');
};

const isValidAminoAcidInsertionQuery = (
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

const isValidAminoAcidMutationQuery = (
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

const isValidNucleotideInsertionQuery = (
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

const isValidNucleotideMutationQuery = (
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

export const mutationQuery = (
    mutation: string,
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames,
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
