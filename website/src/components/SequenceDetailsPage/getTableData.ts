import { sentenceCase } from 'change-case';
import { err, ok, Result } from 'neverthrow';
import z from 'zod';

import type { TableDataEntry } from './types.js';
import { type LapisClient } from '../../services/lapisClient.ts';
import type { ProblemDetail } from '../../types/backend.ts';
import type { Metadata, Schema, SegmentedMutations } from '../../types/config.ts';
import {
    type Details,
    type DetailsResponse,
    type InsertionCount,
    type MutationProportionCount,
} from '../../types/lapis.ts';
import { type ReferenceGenomes, SINGLE_REFERENCE, type Suborganism } from '../../types/referencesGenomes.ts';
import { parseUnixTimestamp } from '../../utils/parseUnixTimestamp.ts';

type GetTableDataResult = {
    data: TableDataEntry[];
    suborganism: Suborganism;
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
                    const suborganismResult = getSuborganism(data.details, schema, referenceGenomes, accessionVersion);
                    if (suborganismResult.isErr()) {
                        return err(suborganismResult.error);
                    }

                    return ok({
                        data: toTableData(schema)(data),
                        suborganism: suborganismResult.value,
                        isRevocation: isRevocationEntry(data.details),
                    });
                }),
        );
}

function getSuborganism(
    details: Details,
    _schema: Schema,
    referenceGenomes: ReferenceGenomes,
    accessionVersion: string,
): Result<Suborganism, ProblemDetail> {
    if (SINGLE_REFERENCE in referenceGenomes) {
        return ok(SINGLE_REFERENCE);
    }
    const suborganismField = 'genotype'; // TODO read from schema
    const value = details[suborganismField];
    const suborganismResult = z.string().safeParse(value);
    if (!suborganismResult.success) {
        return err({
            type: 'about:blank',
            title: 'Invalid suborganism field',
            status: 0,
            detail: `Value '${value}' of field '${suborganismField}' is not a valid string.`,
            instance: '/seq/' + accessionVersion,
        });
    }
    const suborganism = suborganismResult.data;
    if (!(suborganism in referenceGenomes)) {
        return err({
            type: 'about:blank',
            title: 'Invalid suborganism',
            status: 0,
            detail: `Suborganism '${suborganism}' (value of field '${suborganismField}') not found in reference genomes.`,
            instance: '/seq/' + accessionVersion,
        });
    }
    return ok(suborganism);
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
): TableDataEntry[] {
    const data: TableDataEntry[] = [
        {
            label: 'Substitutions',
            name: 'nucleotideSubstitutions',
            value: '',
            header: 'Nucleotide mutations',
            customDisplay: { type: 'badge', value: substitutionsMap(nucleotideMutations) },
            type: { kind: 'mutation' },
        },
        {
            label: 'Deletions',
            name: 'nucleotideDeletions',
            value: deletionsToCommaSeparatedString(nucleotideMutations),
            header: 'Nucleotide mutations',
            type: { kind: 'mutation' },
        },
        {
            label: 'Insertions',
            name: 'nucleotideInsertions',
            value: insertionsToCommaSeparatedString(nucleotideInsertions),
            header: 'Nucleotide mutations',
            type: { kind: 'mutation' },
        },
        {
            label: 'Substitutions',
            name: 'aminoAcidSubstitutions',
            value: '',
            header: 'Amino acid mutations',
            customDisplay: { type: 'badge', value: substitutionsMap(aminoAcidMutations) },
            type: { kind: 'mutation' },
        },
        {
            label: 'Deletions',
            name: 'aminoAcidDeletions',
            value: deletionsToCommaSeparatedString(aminoAcidMutations),
            header: 'Amino acid mutations',
            type: { kind: 'mutation' },
        },
        {
            label: 'Insertions',
            name: 'aminoAcidInsertions',
            value: insertionsToCommaSeparatedString(aminoAcidInsertions),
            header: 'Amino acid mutations',
            type: { kind: 'mutation' },
        },
    ];
    return data;
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
            );
            data.push(...mutations);
        }

        return data;
    };
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

export function substitutionsMap(mutationData: MutationProportionCount[]): SegmentedMutations[] {
    const result: SegmentedMutations[] = [];
    const substitutionData = mutationData.filter((m) => m.mutationTo !== '-');

    const segmentMutationsMap = new Map<string, MutationProportionCount[]>();
    for (const entry of substitutionData) {
        let sequenceName = '';
        if (entry.sequenceName !== null) {
            sequenceName = entry.sequenceName;
        }
        if (!segmentMutationsMap.has(sequenceName)) {
            segmentMutationsMap.set(sequenceName, []);
        }
        segmentMutationsMap.get(sequenceName)!.push(entry);
    }
    for (const [segment, mutations] of segmentMutationsMap.entries()) {
        result.push({ segment, mutations });
    }

    return result;
}

function deletionsToCommaSeparatedString(mutationData: MutationProportionCount[]) {
    const segmentPositions = new Map<string | null, number[]>();
    mutationData
        .filter((m) => m.mutationTo === '-')
        .forEach((m) => {
            const segment: string | null = m.sequenceName;
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

function insertionsToCommaSeparatedString(insertionData: InsertionCount[]) {
    return insertionData.map((m) => m.insertion).join(', ');
}
