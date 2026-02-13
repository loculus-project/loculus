import { sentenceCase } from 'change-case';
import { err, ok, Result } from 'neverthrow';

import type { TableDataEntry } from './types.js';
import { type LapisClient } from '../../services/lapisClient.ts';
import type { ProblemDetail } from '../../types/backend.ts';
import type {
    Metadata,
    MutationBadgeData,
    Schema,
    SegmentedMutationStrings,
    SegmentedMutations,
} from '../../types/config.ts';
import {
    type Details,
    type DetailsResponse,
    type InsertionCount,
    type MutationProportionCount,
} from '../../types/lapis.ts';
import { type ReferenceGenomesInfo } from '../../types/referencesGenomes.ts';
import { parseUnixTimestamp } from '../../utils/parseUnixTimestamp.ts';
import { getSelectedReferences } from '../../utils/referenceSelection.ts';
import {
    lapisNameToDisplayName,
    segmentsWithMultipleReferences,
    type SegmentReferenceSelections,
} from '../../utils/sequenceTypeHelpers.ts';

export type GetTableDataResult = {
    data: TableDataEntry[];
    isRevocation: boolean;
    segmentReferences?: SegmentReferenceSelections;
};

export async function getTableData(
    accessionVersion: string,
    schema: Schema,
    referenceGenomesInfo: ReferenceGenomesInfo,
    lapisClient: LapisClient,
): Promise<Result<GetTableDataResult, ProblemDetail>> {
    return Promise.all([
        lapisClient.getSequenceEntryVersionDetails(accessionVersion),
        lapisClient.getSequenceMutations(accessionVersion, 'nucleotide'),
        lapisClient.getSequenceMutations(accessionVersion, 'aminoAcid'),
        lapisClient.getSequenceInsertions(accessionVersion, 'nucleotide'),
        lapisClient.getSequenceInsertions(accessionVersion, 'aminoAcid'),
    ])
        .then((results) => Result.combine(results))
        .then(validateDetailsAreNotEmpty(accessionVersion))
        .then((result) =>
            result
                .map(
                    ([
                        details,
                        nucleotideMutations,
                        aminoAcidMutations,
                        nucleotideInsertions,
                        aminoAcidInsertions,
                    ]) => ({
                        details: details.data[0],
                        nucleotideMutations: nucleotideMutations.data,
                        aminoAcidMutations: aminoAcidMutations.data,
                        nucleotideInsertions: nucleotideInsertions.data,
                        aminoAcidInsertions: aminoAcidInsertions.data,
                    }),
                )
                .andThen((data) => {
                    if (
                        segmentsWithMultipleReferences(referenceGenomesInfo).length > 0 &&
                        schema.referenceIdentifierField === undefined
                    ) {
                        return err({
                            type: 'about:blank',
                            title: 'Invalid configuration',
                            status: 0,
                            detail: `No 'referenceIdentifierField' has been configured in the schema for organism ${schema.organismName}`,
                            instance: '/seq/' + accessionVersion,
                        });
                    }
                    const segmentReferences = schema.referenceIdentifierField
                        ? getSelectedReferences({
                              referenceGenomesInfo,
                              referenceIdentifierField: schema.referenceIdentifierField,
                              state: data.details,
                          })
                        : undefined;

                    return ok({
                        data: toTableData(schema, referenceGenomesInfo, data),
                        isRevocation: isRevocationEntry(data.details),
                        segmentReferences,
                    });
                }),
        );
}

function isRevocationEntry(details: Details): boolean {
    return details.isRevocation === true;
}

function validateDetailsAreNotEmpty<T extends [DetailsResponse, ...unknown[]]>(accessionVersion: string) {
    return (result: Result<T, ProblemDetail>): Result<T, ProblemDetail> => {
        if (result.isOk()) {
            const detailsResult = result.value[0];
            if (detailsResult.data.length === 0) {
                return err({
                    type: 'about:blank',
                    title: 'Not Found',
                    status: 0,
                    detail: 'No data found for accession version ' + accessionVersion,
                    instance: '/seq/' + accessionVersion,
                });
            }
        }
        return result;
    };
}

function mutationDetails(
    nucleotideMutations: MutationProportionCount[],
    aminoAcidMutations: MutationProportionCount[],
    nucleotideInsertions: InsertionCount[],
    aminoAcidInsertions: InsertionCount[],
    referenceGenomesInfo: ReferenceGenomesInfo,
): TableDataEntry[] {
    const data: TableDataEntry[] = [
        {
            label: 'Substitutions',
            name: 'nucleotideSubstitutions',
            value: '',
            header: 'Nucleotide mutations',
            customDisplay: {
                type: 'badge',
                badge: substitutionsMap(nucleotideMutations, referenceGenomesInfo, true),
            },
            type: { kind: 'mutation' },
        },
        {
            label: 'Deletions',
            name: 'nucleotideDeletions',
            value: '',
            header: 'Nucleotide mutations',
            customDisplay: {
                type: 'list',
                list: deletionsMap(nucleotideMutations, referenceGenomesInfo, true),
            },
            type: { kind: 'mutation' },
        },
        {
            label: 'Insertions',
            name: 'nucleotideInsertions',
            value: '',
            header: 'Nucleotide mutations',
            customDisplay: {
                type: 'list',
                list: insertionsMap(nucleotideInsertions, referenceGenomesInfo, true),
            },
            type: { kind: 'mutation' },
        },
        {
            label: 'Substitutions',
            name: 'aminoAcidSubstitutions',
            value: '',
            header: 'Amino acid mutations',
            customDisplay: {
                type: 'badge',
                badge: substitutionsMap(aminoAcidMutations, referenceGenomesInfo),
            },
            type: { kind: 'mutation' },
        },
        {
            label: 'Deletions',
            name: 'aminoAcidDeletions',
            value: '',
            header: 'Amino acid mutations',
            customDisplay: {
                type: 'list',
                list: deletionsMap(aminoAcidMutations, referenceGenomesInfo),
            },
            type: { kind: 'mutation' },
        },
        {
            label: 'Insertions',
            name: 'aminoAcidInsertions',
            value: '',
            header: 'Amino acid mutations',
            customDisplay: {
                type: 'list',
                list: insertionsMap(aminoAcidInsertions, referenceGenomesInfo),
            },
            type: { kind: 'mutation' },
        },
    ];
    return data;
}

function toTableData(
    config: Schema,
    referenceGenomesInfo: ReferenceGenomesInfo,
    {
        details,
        nucleotideMutations,
        aminoAcidMutations,
        nucleotideInsertions,
        aminoAcidInsertions,
    }: {
        details: Details;
        nucleotideMutations: MutationProportionCount[];
        aminoAcidMutations: MutationProportionCount[];
        nucleotideInsertions: InsertionCount[];
        aminoAcidInsertions: InsertionCount[];
    },
): TableDataEntry[] {
    const data: TableDataEntry[] = config.metadata
        .filter((metadata) => metadata.hideOnSequenceDetailsPage !== true)
        .filter((metadata) => details[metadata.name] !== null && metadata.name in details)
        .map((metadata) => ({
            label: metadata.displayName ?? sentenceCase(metadata.name),
            name: metadata.name,
            customDisplay: metadata.customDisplay,
            value: mapValueToDisplayedValue(details[metadata.name], metadata),
            header: metadata.header ?? '',
            type: { kind: 'metadata', metadataType: metadata.type },
            orderOnDetailsPage: metadata.orderOnDetailsPage,
        }));

    if (config.submissionDataTypes.consensusSequences) {
        const mutations = mutationDetails(
            nucleotideMutations,
            aminoAcidMutations,
            nucleotideInsertions,
            aminoAcidInsertions,
            referenceGenomesInfo,
        );
        data.push(...mutations);
    }

    return data;
}

function mapValueToDisplayedValue(value: undefined | null | string | number | boolean, metadata: Metadata) {
    if (value === null || value === undefined) {
        return 'N/A';
    }

    if (metadata.type === 'timestamp' && typeof value === 'number') {
        return parseUnixTimestamp(value);
    }

    return value;
}

export function substitutionsMap(
    mutationData: MutationProportionCount[],
    referenceGenomesInfo: ReferenceGenomesInfo,
    nucleotide: boolean = false,
): SegmentedMutations[] {
    const result: SegmentedMutations[] = [];
    const substitutionData = mutationData.filter((m) => m.mutationTo !== '-');
    const lapisNameToDisplayNameMap = lapisNameToDisplayName(referenceGenomesInfo);

    const segmentMutationsMap = new Map<string, MutationBadgeData[]>();
    for (const entry of substitutionData) {
        const { sequenceName, mutationFrom, position, mutationTo } = entry;
        const sequenceDisplayName = sequenceName ? (lapisNameToDisplayNameMap.get(sequenceName) ?? null) : null;

        const sequenceKey = sequenceDisplayName ?? '';
        if (!segmentMutationsMap.has(sequenceKey)) {
            segmentMutationsMap.set(sequenceKey, []);
        }
        segmentMutationsMap
            .get(sequenceKey)!
            // Do not show the segment name in the nucleotide mutation badges
            .push({ sequenceName: nucleotide ? null : sequenceDisplayName, mutationFrom, position, mutationTo });
    }
    for (const [segment, mutations] of segmentMutationsMap.entries()) {
        result.push({ segment, mutations });
    }

    return result;
}

function deletionsMap(
    mutationData: MutationProportionCount[],
    referenceGenomesInfo: ReferenceGenomesInfo,
    nucleotide: boolean = false,
): SegmentedMutationStrings[] {
    const segmentPositions = new Map<string | null, number[]>();
    const lapisNameToDisplayNameMap = lapisNameToDisplayName(referenceGenomesInfo);
    mutationData
        .filter((m) => m.mutationTo === '-')
        .forEach((m) => {
            const segment = m.sequenceName ? (lapisNameToDisplayNameMap.get(m.sequenceName) ?? null) : null;
            const position = m.position;
            if (!segmentPositions.has(segment)) {
                segmentPositions.set(segment, []);
            }
            segmentPositions.get(segment)!.push(position);
        });
    if (segmentPositions.size === 0) {
        return [];
    }
    const segmentRanges = [...segmentPositions.entries()].map(([segment, positions]) => {
        const sortedPositions = positions.sort((a, b) => a - b);
        const ranges = [];
        let rangeStart: number | null = null;
        for (let i = 0; i < sortedPositions.length; i++) {
            const current = sortedPositions[i];
            const next = sortedPositions[i + 1] as number | undefined;
            rangeStart ??= current;
            if (next === undefined || next !== current + 1) {
                if (current - rangeStart >= 2) {
                    ranges.push(`${rangeStart}-${current}`);
                } else {
                    ranges.push(rangeStart.toString());
                    if (current !== rangeStart) {
                        ranges.push(current.toString());
                    }
                }
                rangeStart = null;
            }
        }
        return { segment, ranges };
    });
    segmentRanges.sort((a, b) => {
        const safeA = a.segment ?? '';
        const safeB = b.segment ?? '';
        if (safeA <= safeB) {
            return -1;
        } else {
            return 1;
        }
    });
    return segmentRanges.map(({ segment, ranges }) => ({
        segment: segment ?? '',
        mutations: ranges.map((range) => `${!nucleotide && segment !== null ? segment + ':' : ''}${range}`),
    }));
}

function insertionsMap(
    insertionData: InsertionCount[],
    referenceGenomesInfo: ReferenceGenomesInfo,
    nucleotide: boolean = false,
): SegmentedMutationStrings[] {
    const result: SegmentedMutationStrings[] = [];
    const insertions = new Map<string, string[]>();
    const lapisNameToDisplayNameMap = lapisNameToDisplayName(referenceGenomesInfo);
    const segmentInsertionsMap = insertionData.map((insertion) => {
        const sequenceDisplayName = insertion.sequenceName
            ? lapisNameToDisplayNameMap.get(insertion.sequenceName)
            : null;

        const sequenceNamePart = !nucleotide && sequenceDisplayName ? sequenceDisplayName + ':' : '';
        return {
            segment: sequenceDisplayName ?? '',
            insertion: `ins_${sequenceNamePart}${insertion.position}:${insertion.insertedSymbols}`,
        };
    });
    if (segmentInsertionsMap.length === 0) {
        return [];
    }
    for (const { segment, insertion } of segmentInsertionsMap) {
        if (!insertions.has(segment)) {
            insertions.set(segment, []);
        }
        insertions.get(segment)!.push(insertion);
    }

    for (const [segment, mutations] of insertions.entries()) {
        result.push({ segment, mutations });
    }

    return result;
}
