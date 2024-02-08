import { sentenceCase } from 'change-case';
import { DateTime, FixedOffsetZone } from 'luxon';
import { err, Result } from 'neverthrow';

import { type LapisClient } from '../../services/lapisClient.ts';
import type { ProblemDetail } from '../../types/backend.ts';
import type { Metadata, Schema } from '../../types/config.ts';
import {
    type Details,
    type DetailsResponse,
    type InsertionCount,
    type MutationProportionCount,
    type SequenceEntryHistory,
    type SequenceEntryHistoryEntry,
} from '../../types/lapis.ts';

export type TableDataEntry = { label: string; name: string; value: string | number };

export async function getTableData(
    accessionVersion: string,
    schema: Schema,
    lapisClient: LapisClient,
): Promise<Result<TableDataEntry[], ProblemDetail>> {
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
                .map(toTableData(schema)),
        );
}

export function isRevocationEntry(tableData: TableDataEntry[]): boolean {
    return tableData.some((entry) => entry.name === 'isRevocation' && entry.value === 'true');
}

export function getLatestAccessionVersion(
    sequenceEntryHistory: SequenceEntryHistory,
): SequenceEntryHistoryEntry | undefined {
    if (sequenceEntryHistory.length === 0) {
        return undefined;
    }
    return sequenceEntryHistory.sort((a, b) => b.version - a.version)[0];
}

function validateDetailsAreNotEmpty<T extends [DetailsResponse, ...any[]]>(accessionVersion: string) {
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

function toTableData(config: Schema) {
    return ({
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
    }): TableDataEntry[] => {
        const data: TableDataEntry[] = config.metadata.map((metadata) => ({
            label: sentenceCase(metadata.name),
            name: metadata.name,
            value: mapValueToDisplayedValue(details[metadata.name], metadata),
        }));
        data.push(
            {
                label: 'Nucleotide substitutions',
                name: 'nucleotideSubstitutions',
                value: substitutionsToCommaSeparatedString(nucleotideMutations),
            },
            {
                label: 'Nucleotide deletions',
                name: 'nucleotideDeletions',
                value: deletionsToCommaSeparatedString(nucleotideMutations),
            },
            {
                label: 'Nucleotide insertions',
                name: 'nucleotideInsertions',
                value: insertionsToCommaSeparatedString(nucleotideInsertions),
            },
            {
                label: 'Amino acid substitutions',
                name: 'aminoAcidSubstitutions',
                value: substitutionsToCommaSeparatedString(aminoAcidMutations),
            },
            {
                label: 'Amino acid deletions',
                name: 'aminoAcidDeletions',
                value: deletionsToCommaSeparatedString(aminoAcidMutations),
            },
            {
                label: 'Amino acid insertions',
                name: 'aminoAcidInsertions',
                value: insertionsToCommaSeparatedString(aminoAcidInsertions),
            },
        );

        return data;
    };
}

function mapValueToDisplayedValue(value: undefined | null | string | number, metadata: Metadata) {
    if (value === null || value === undefined) {
        return 'N/A';
    }

    if (metadata.type === 'timestamp' && typeof value === 'number') {
        return DateTime.fromSeconds(value, { zone: FixedOffsetZone.utcInstance }).toFormat('yyyy-MM-dd TTT');
    }

    return value;
}

function substitutionsToCommaSeparatedString(mutationData: MutationProportionCount[]) {
    return mutationData
        .map((m) => m.mutation)
        .filter((m) => !m.endsWith('-'))
        .join(', ');
}

function deletionsToCommaSeparatedString(mutationData: MutationProportionCount[]) {
    const segmentPositions = new Map<string | undefined, number[]>();
    mutationData
        .filter((m) => m.mutation.endsWith('-'))
        .forEach((m) => {
            const parts = m.mutation.split(':');
            const [segment, mutation] = parts.length === 1 ? ([undefined, parts[0]] as const) : parts;
            const position = Number.parseInt(mutation.slice(1, -1), 10);
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
            if (rangeStart === null) {
                rangeStart = current;
            }
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
        .map(({ segment, ranges }) => ranges.map((range) => `${segment !== undefined ? segment + ':' : ''}${range}`))
        .flat()
        .join(', ');
}

function insertionsToCommaSeparatedString(insertionData: InsertionCount[]) {
    return insertionData.map((m) => m.insertion).join(', ');
}
