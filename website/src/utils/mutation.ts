import type { BaseType } from './sequenceTypeHelpers';
import type { SuborganismSegmentAndGeneInfo } from './getSuborganismSegmentAndGeneInfo.tsx';

export type MutationType = 'substitutionOrDeletion' | 'insertion';

export type MutationQuery = {
    baseType: BaseType;
    mutationType: MutationType;
    text: string;
    lapisQuery: string;
};

export type MutationSearchParams = {
    nucleotideMutations: string[];
    aminoAcidMutations: string[];
    nucleotideInsertions: string[];
    aminoAcidInsertions: string[];
};

export const removeMutationQueries = (
    mutations: string,
    suborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo,
    baseType: BaseType,
    mutationType: MutationType,
): string => {
    const mutationQueries = parseMutationsString(mutations, suborganismSegmentAndGeneInfo);
    const filteredMutationQueries = mutationQueries.filter(
        (mq) => !(mq.baseType === baseType && mq.mutationType === mutationType),
    );
    return serializeMutationQueries(filteredMutationQueries);
};

export const parseMutationsString = (
    value: string,
    suborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo,
): MutationQuery[] => {
    return value
        .split(',')
        .map((mutation) => parseMutationString(mutation.trim(), suborganismSegmentAndGeneInfo))
        .filter(Boolean) as MutationQuery[];
};

/**
 * Turn a mutation string such as 'A23T' into a {@link MutationQuery} object.
 * Can return `undefined` if the string cannot be parsed into a valid mutation query.
 */
export const parseMutationString = (
    mutation: string,
    suborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo,
): MutationQuery | undefined => {
    const tests = [
        { baseType: 'nucleotide', mutationType: 'substitutionOrDeletion', test: isValidNucleotideMutationQuery },
        { baseType: 'aminoAcid', mutationType: 'substitutionOrDeletion', test: isValidAminoAcidMutationQuery },
        { baseType: 'nucleotide', mutationType: 'insertion', test: isValidNucleotideInsertionQuery },
        { baseType: 'aminoAcid', mutationType: 'insertion', test: isValidAminoAcidInsertionQuery },
    ] as const;

    for (const { baseType, mutationType, test } of tests) {
        const mutationTestResult = test(mutation, suborganismSegmentAndGeneInfo);
        if (mutationTestResult.valid) {
            return { baseType, mutationType, text: mutationTestResult.text, lapisQuery: mutationTestResult.lapisQuery };
        }
    }
};

export const serializeMutationQueries = (selectedOptions: MutationQuery[]): string => {
    return selectedOptions.map((option) => option.text).join(', ');
};

export const intoMutationSearchParams = (
    mutation: string | undefined,
    suborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo,
): MutationSearchParams => {
    const mutationFilter = parseMutationsString(mutation ?? '', suborganismSegmentAndGeneInfo);

    return {
        nucleotideMutations: mutationFilter
            .filter((m) => m.baseType === 'nucleotide' && m.mutationType === 'substitutionOrDeletion')
            .map((m) => m.lapisQuery),
        aminoAcidMutations: mutationFilter
            .filter((m) => m.baseType === 'aminoAcid' && m.mutationType === 'substitutionOrDeletion')
            .map((m) => m.lapisQuery),
        nucleotideInsertions: mutationFilter
            .filter((m) => m.baseType === 'nucleotide' && m.mutationType === 'insertion')
            .map((m) => m.lapisQuery),
        aminoAcidInsertions: mutationFilter
            .filter((m) => m.baseType === 'aminoAcid' && m.mutationType === 'insertion')
            .map((m) => m.lapisQuery),
    };
};

type MutationTestResult = { valid: true; text: string; lapisQuery: string } | { valid: false };

const INVALID: MutationTestResult = { valid: false };

const isValidAminoAcidInsertionQuery = (
    text: string,
    suborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo,
): MutationTestResult => {
    try {
        const textUpper = text.toUpperCase();
        if (!textUpper.startsWith('INS_')) {
            return INVALID;
        }
        const query = textUpper.slice(4);
        const [gene, position, insertion] = query.split(':');

        const geneInfo = suborganismSegmentAndGeneInfo.geneInfos.find((geneInfo) => geneInfo.label === gene);

        if (geneInfo === undefined || !Number.isInteger(Number(position)) || !/^[A-Z*?]+$/.test(insertion)) {
            return INVALID;
        }

        return {
            valid: true,
            text,
            lapisQuery: `ins_${geneInfo.lapisName}:${position}:${insertion}`,
        };
    } catch (_) {
        return INVALID;
    }
};

const isValidAminoAcidMutationQuery = (
    text: string,
    suborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo,
): MutationTestResult => {
    try {
        const textUpper = text.toUpperCase();
        const [gene, mutation] = textUpper.split(':');

        const geneInfo = suborganismSegmentAndGeneInfo.geneInfos.find((geneInfo) => geneInfo.label === gene);

        if (geneInfo === undefined) {
            return false;
        }
        return /^[A-Z*]?[0-9]+[A-Z-*.]?$/.test(mutation);
    } catch (_) {
        return false;
    }
};

const isValidNucleotideInsertionQuery = (
    text: string,
    suborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo,
): MutationTestResult => {
    try {
        const isMultiSegmented = suborganismReferenceGenomeLightweightSchema.nucleotideSegmentNames.length > 1;
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
                suborganismReferenceGenomeLightweightSchema.nucleotideSegmentNames.map((n) => n.toUpperCase()),
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
    suborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo,
): MutationTestResult => {
    try {
        const isMultiSegmented = suborganismReferenceGenomeLightweightSchema.nucleotideSegmentNames.length > 1;
        const textUpper = text.toUpperCase();
        let mutation = textUpper;
        if (isMultiSegmented) {
            const [segment, _mutation] = textUpper.split(':');
            const existingSegments = new Set(
                suborganismReferenceGenomeLightweightSchema.nucleotideSegmentNames.map((n) => n.toUpperCase()),
            );
            if (!existingSegments.has(segment)) {
                return false;
            }
            mutation = _mutation;
        }
        return /^[A-Z]?[0-9]+[A-Z-.]?$/.test(mutation);
    } catch (_) {
        return false;
    }
};

class Mutation {
    public readonly geneOrSegment?: string;
    public readonly mutation: string;

    constructor({ geneOrSegment, mutation }: { geneOrSegment?: string; mutation: string }) {
        this.geneOrSegment = geneOrSegment;
        this.mutation = mutation;
    }

    public toString(): string {
        return this.geneOrSegment ? `${this.geneOrSegment}:${this.mutation}` : this.mutation;
    }
}

class Insertion {
    public readonly geneOrSegment?: string;
    public readonly position: number;
    public readonly insertion: string;

    constructor({
        geneOrSegment,
        position,
        insertion,
    }: {
        geneOrSegment?: string;
        position: number;
        insertion: string;
    }) {
        this.geneOrSegment = geneOrSegment;
        this.position = position;
        this.insertion = insertion;
    }

    public toString(): string {
        return this.geneOrSegment
            ? `ins_${this.geneOrSegment}:${this.position}:${this.insertion}`
            : `ins_${this.position}:${this.insertion}`;
    }
}
