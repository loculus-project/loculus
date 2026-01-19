import { sentenceCase } from 'change-case';
import { err, ok, Result } from 'neverthrow';
import z from 'zod';

import type { TableDataEntry } from './types.js';
import { type LapisClient } from '../../services/lapisClient.ts';
import type { ProblemDetail } from '../../types/backend.ts';
import type { Metadata, MutationBadgeData, Schema, SegmentedMutations } from '../../types/config.ts';
import {
    type Details,
    type DetailsResponse,
    type InsertionCount,
    type MutationProportionCount,
} from '../../types/lapis.ts';
import { type ReferenceGenomes } from '../../types/referencesGenomes.ts';
import { parseUnixTimestamp } from '../../utils/parseUnixTimestamp.ts';
import { getReferenceIdentifier, getSelectedReferences } from '../../utils/referenceSelection.ts';
import {
    lapisNameToDisplayName,
    segmentsWithMultipleReferences,
    type SegmentReferenceSelections,
} from '../../utils/sequenceTypeHelpers.ts';

export type GetTableDataResult = {
    data: TableDataEntry[];
    segmentReferences: SegmentReferenceSelections;
    isRevocation: boolean;
};

export async function getTableData(
    accessionVersion: string,
    schema: Schema,
    referenceGenomes: ReferenceGenomes,
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
                        segmentsWithMultipleReferences(referenceGenomes).length > 0 &&
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
                    const segmentReferences = getSelectedReferences({
                        referenceGenomes,
                        schema,
                        state: data.details,
                    });

                    return ok({
                        data: toTableData(schema, referenceGenomes, data),
                        segmentReferences,
                        isRevocation: isRevocationEntry(data.details),
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
    referenceGenomes: ReferenceGenomes,
): TableDataEntry[] {
    const data: TableDataEntry[] = [
        {
            label: 'Substitutions',
            name: 'nucleotideSubstitutions',
            value: '',
            header: 'Nucleotide mutations',
            customDisplay: {
                type: 'badge',
                value: substitutionsMap(nucleotideMutations, referenceGenomes),
            },
            type: { kind: 'mutation' },
        },
        {
            label: 'Deletions',
            name: 'nucleotideDeletions',
            value: deletionsToCommaSeparatedString(nucleotideMutations, referenceGenomes),
            header: 'Nucleotide mutations',
            type: { kind: 'mutation' },
        },
        {
            label: 'Insertions',
            name: 'nucleotideInsertions',
            value: insertionsToCommaSeparatedString(nucleotideInsertions, referenceGenomes),
            header: 'Nucleotide mutations',
            type: { kind: 'mutation' },
        },
        {
            label: 'Substitutions',
            name: 'aminoAcidSubstitutions',
            value: '',
            header: 'Amino acid mutations',
            customDisplay: {
                type: 'badge',
                value: substitutionsMap(aminoAcidMutations, referenceGenomes),
            },
            type: { kind: 'mutation' },
        },
        {
            label: 'Deletions',
            name: 'aminoAcidDeletions',
            value: deletionsToCommaSeparatedString(aminoAcidMutations, referenceGenomes),
            header: 'Amino acid mutations',
            type: { kind: 'mutation' },
        },
        {
            label: 'Insertions',
            name: 'aminoAcidInsertions',
            value: insertionsToCommaSeparatedString(aminoAcidInsertions, referenceGenomes),
            header: 'Amino acid mutations',
            type: { kind: 'mutation' },
        },
    ];
    return data;
}

function toTableData(
    config: Schema,
    referenceGenomes: ReferenceGenomes,
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
            referenceGenomes,
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
    referenceGenomes: ReferenceGenomes,
): SegmentedMutations[] {
    const result: SegmentedMutations[] = [];
    const substitutionData = mutationData.filter((m) => m.mutationTo !== '-');
    const lapisNameToDisplayNameMap = lapisNameToDisplayName(referenceGenomes);

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
            .push({ sequenceName: sequenceDisplayName, mutationFrom, position, mutationTo });
    }
    for (const [segment, mutations] of segmentMutationsMap.entries()) {
        result.push({ segment, mutations });
    }

    return result;
}

function deletionsToCommaSeparatedString(mutationData: MutationProportionCount[], referenceGenomes: ReferenceGenomes) {
    const segmentPositions = new Map<string | null, number[]>();
    const lapisNameToDisplayNameMap = lapisNameToDisplayName(referenceGenomes);
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
    return segmentRanges
        .map(({ segment, ranges }) => ranges.map((range) => `${segment !== null ? segment + ':' : ''}${range}`))
        .flat()
        .join(', ');
}

function insertionsToCommaSeparatedString(insertionData: InsertionCount[], referenceGenomes: ReferenceGenomes) {
    const lapisNameToDisplayNameMap = lapisNameToDisplayName(referenceGenomes);
    return insertionData
        .map((insertion) => {
            const sequenceDisplayName = insertion.sequenceName
                ? lapisNameToDisplayNameMap.get(insertion.sequenceName)
                : null;

            const sequenceNamePart = sequenceDisplayName ? sequenceDisplayName + ':' : '';
            return `ins_${sequenceNamePart}${insertion.position}:${insertion.insertedSymbols}`;
        })
        .join(', ');
}
