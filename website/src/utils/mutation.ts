import { getReferenceIdentifier } from './referenceSelection';
import { MUTATION_KEY } from './search';
import { type BaseType, type SingleSegmentAndGeneInfo, type SegmentAndGeneInfo } from './sequenceTypeHelpers';
import type { FieldValues } from '../types/config';

export type MutationType = 'substitutionOrDeletion' | 'insertion';

export type MutationQuery = {
    baseType: BaseType;
    mutationType: MutationType;
    /**
     * The mutation as entered by the user and as displayed in the UI.
     */
    text: string;
    /**
     * The mutation as sent to LAPIS for searching.
     * This is usually different from `text` when there are several suborganisms.
     */
    lapisQuery: string;
};

export type MutationSearchParams = {
    nucleotideMutations: string[];
    aminoAcidMutations: string[];
    nucleotideInsertions: string[];
    aminoAcidInsertions: string[];
};

export const parseMutationsString = (value: string, segmentAndGeneInfo: SingleSegmentAndGeneInfo): MutationQuery[] => {
    return value
        .split(',')
        .map((mutation) => parseMutationString(mutation.trim(), segmentAndGeneInfo))
        .filter(Boolean) as MutationQuery[];
};

/**
 * Turn a mutation string such as 'A23T' into a {@link MutationQuery} object.
 * Can return `undefined` if the string cannot be parsed into a valid mutation query.
 */
export const parseMutationString = (
    mutation: string,
    segmentAndGeneInfo: SingleSegmentAndGeneInfo,
): MutationQuery | undefined => {
    const tests = [
        { baseType: 'nucleotide', mutationType: 'substitutionOrDeletion', test: isValidNucleotideMutationQuery },
        { baseType: 'aminoAcid', mutationType: 'substitutionOrDeletion', test: isValidAminoAcidMutationQuery },
        { baseType: 'nucleotide', mutationType: 'insertion', test: isValidNucleotideInsertionQuery },
        { baseType: 'aminoAcid', mutationType: 'insertion', test: isValidAminoAcidInsertionQuery },
    ] as const;

    for (const { baseType, mutationType, test } of tests) {
        const mutationTestResult = test(mutation, segmentAndGeneInfo);
        if (mutationTestResult.valid) {
            return { baseType, mutationType, text: mutationTestResult.text, lapisQuery: mutationTestResult.lapisQuery };
        }
    }
};

export const serializeMutationQueries = (selectedOptions: MutationQuery[]): string => {
    return selectedOptions.map((option) => option.text).join(', ');
};

export const intoMutationSearchParams = (
    fieldValues: FieldValues,
    segmentAndGeneInfo: SegmentAndGeneInfo,
): MutationSearchParams => {
    let mutationFilter: MutationQuery[] = [];
    for (const segment of segmentAndGeneInfo.nucleotideSegmentInfos) {
        const mutationParamName = getReferenceIdentifier(
            MUTATION_KEY,
            segment.name,
            segmentAndGeneInfo.multiSegmented === true,
        );
        const filteredSegmentAndGeneInfo: SingleSegmentAndGeneInfo = {
            ...segmentAndGeneInfo,
            nucleotideSegmentInfo: segment,
            geneInfos: segmentAndGeneInfo.geneInfos.filter((geneInfo) => geneInfo.segmentName === segment.name),
        };
        const segmentMutationFilter = parseMutationsString(
            String(fieldValues[mutationParamName] ?? ''),
            filteredSegmentAndGeneInfo,
        );
        mutationFilter = mutationFilter.concat(segmentMutationFilter);
    }

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
    segmentAndGeneInfo: SingleSegmentAndGeneInfo,
): MutationTestResult => {
    try {
        const textUpper = text.toUpperCase();

        const regex = /^INS_(?<gene>[A-Z0-9_-]+):(?<position>\d+):(?<insertion>[A-Z*?]+)$/;
        const match = regex.exec(textUpper);

        if (match === null) {
            return INVALID;
        }

        const { gene, position, insertion } = match.groups as { gene: string; position: string; insertion: string };

        const geneInfo = segmentAndGeneInfo.geneInfos.find((geneInfo) => geneInfo.name.toUpperCase() === gene);

        if (geneInfo === undefined) {
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
    segmentAndGeneInfo: SingleSegmentAndGeneInfo,
): MutationTestResult => {
    try {
        const textUpper = text.toUpperCase();

        const regex = /^(?<gene>[A-Z0-9_-]+):(?<mutation>[A-Z*]?[0-9]+[A-Z-*.]?)$/;
        const match = regex.exec(textUpper);

        if (match === null) {
            return INVALID;
        }

        const { gene, mutation } = match.groups as { gene: string; mutation: string };
        const geneInfo = segmentAndGeneInfo.geneInfos.find((geneInfo) => geneInfo.name.toUpperCase() === gene);

        if (geneInfo === undefined) {
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
    segmentAndGeneInfo: SingleSegmentAndGeneInfo,
): MutationTestResult => {
    try {
        const textUpper = text.toUpperCase();
        if (!textUpper.startsWith('INS_')) {
            return INVALID;
        }
        const query = textUpper.slice(4);
        const split = query.split(':');
        if (split.length > 2) {
            return INVALID;
        }
        const [position, insertion] = split;

        if (!Number.isInteger(Number(position)) || !/^[A-Z?]+$/.test(insertion)) {
            return INVALID;
        }
        return {
            valid: true,
            text,
            lapisQuery:
                segmentAndGeneInfo.useLapisMultiSegmentedEndpoint === true
                    ? `ins_${segmentAndGeneInfo.nucleotideSegmentInfo.lapisName}:${position}:${insertion}`
                    : `ins_${position}:${insertion}`,
        };
    } catch (_) {
        return INVALID;
    }
};

const isValidNucleotideMutationQuery = (
    text: string,
    segmentAndGeneInfo: SingleSegmentAndGeneInfo,
): MutationTestResult => {
    try {
        const textUpper = text.toUpperCase();
        const mutation = textUpper;

        if (!/^[A-Z]?[0-9]+[A-Z-.]?$/.test(mutation)) {
            return INVALID;
        }

        return {
            valid: true,
            text,
            lapisQuery:
                segmentAndGeneInfo.useLapisMultiSegmentedEndpoint === true
                    ? `${segmentAndGeneInfo.nucleotideSegmentInfo.lapisName}:${mutation}`
                    : mutation,
        };
    } catch (_) {
        return INVALID;
    }
};
