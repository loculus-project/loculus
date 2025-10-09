import type { SuborganismSegmentAndGeneInfo } from './getSuborganismSegmentAndGeneInfo.tsx';
import { type BaseType, isMultiSegmented, type SegmentInfo } from './sequenceTypeHelpers';

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

        const geneInfo = suborganismSegmentAndGeneInfo.geneInfos.find(
            (geneInfo) => geneInfo.label.toUpperCase() === gene,
        );

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

        const geneInfo = suborganismSegmentAndGeneInfo.geneInfos.find(
            (geneInfo) => geneInfo.label.toUpperCase() === gene,
        );

        if (geneInfo === undefined || !/^[A-Z*]?[0-9]+[A-Z-*.]?$/.test(mutation)) {
            return INVALID;
        }

        return {
            valid: true,
            text,
            lapisQuery: `${geneInfo.lapisName}:${mutation}`,
        };
    } catch (_) {
        return INVALID;
    }
};

const isValidNucleotideInsertionQuery = (
    text: string,
    suborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo,
): MutationTestResult => {
    try {
        const multiSegmented = isMultiSegmented(suborganismSegmentAndGeneInfo.nucleotideSegmentInfos);
        const textUpper = text.toUpperCase();
        if (!textUpper.startsWith('INS_')) {
            return INVALID;
        }
        const query = textUpper.slice(4);
        const split = query.split(':');
        if ((!multiSegmented && split.length > 2) || (multiSegmented && split.length > 3)) {
            return INVALID;
        }
        const [segment, position, insertion] = multiSegmented
            ? split
            : ([undefined, ...split] as [undefined | string, string, string]);
        let segmentInfo: SegmentInfo | undefined = suborganismSegmentAndGeneInfo.nucleotideSegmentInfos[0];
        if (segment !== undefined) {
            segmentInfo = suborganismSegmentAndGeneInfo.nucleotideSegmentInfos.find(
                (info) => info.label.toUpperCase() === segment,
            );
        }
        if (segmentInfo === undefined || !Number.isInteger(Number(position)) || !/^[A-Z*?]+$/.test(insertion)) {
            return INVALID;
        }
        return {
            valid: true,
            text,
            lapisQuery: suborganismSegmentAndGeneInfo.isMultiSegmented
                ? `ins_${segmentInfo.lapisName}:${position}:${insertion}`
                : `ins_${position}:${insertion}`,
        };
    } catch (_) {
        return INVALID;
    }
};

const isValidNucleotideMutationQuery = (
    text: string,
    suborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo,
): MutationTestResult => {
    try {
        const multiSegmented = isMultiSegmented(suborganismSegmentAndGeneInfo.nucleotideSegmentInfos);
        const textUpper = text.toUpperCase();
        let mutation = textUpper;
        let segmentInfo: SegmentInfo | undefined = suborganismSegmentAndGeneInfo.nucleotideSegmentInfos[0];

        if (multiSegmented) {
            const [segment, _mutation] = textUpper.split(':');
            segmentInfo = suborganismSegmentAndGeneInfo.nucleotideSegmentInfos.find(
                (info) => info.label.toUpperCase() === segment,
            );
            mutation = _mutation;
        }

        if (segmentInfo === undefined || !/^[A-Z]?[0-9]+[A-Z-.]?$/.test(mutation)) {
            return INVALID;
        }

        return {
            valid: true,
            text,
            lapisQuery: multiSegmented ? `${segmentInfo.lapisName}:${mutation}` : mutation,
        };
    } catch (_) {
        return INVALID;
    }
};
