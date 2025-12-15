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

export type GetTableDataResult = {
    data: TableDataEntry[];
    segmentReferences: Record<string, string> | null;
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
                    const segmentReferencesResult = getSegmentReferences(
                        data.details,
                        schema,
                        referenceGenomes,
                        accessionVersion,
                    );
                    if (segmentReferencesResult.isErr()) {
                        return err(segmentReferencesResult.error);
                    }

                    const segmentReferences = segmentReferencesResult.value;

                    return ok({
                        data: toTableData(schema, segmentReferences, data),
                        segmentReferences,
                        isRevocation: isRevocationEntry(data.details),
                    });
                }),
        );
}

function getSegmentReferences(
    details: Details,
    schema: Schema,
    referenceGenomes: ReferenceGenomes,
    accessionVersion: string,
): Result<Record<string, string> | null, ProblemDetail> {
    const segments = Object.keys(referenceGenomes);

    // Check if single reference mode (only one reference per segment)
    const firstSegment = segments[0];
    const firstSegmentRefs = firstSegment ? Object.keys(referenceGenomes[firstSegment] ?? {}) : [];
    const isSingleReference = firstSegmentRefs.length === 1;

    if (isSingleReference) {
        // Build segment references from the single reference
        const segmentReferences: Record<string, string> = {};
        for (const segmentName of segments) {
            const refs = Object.keys(referenceGenomes[segmentName] ?? {});
            if (refs.length > 0) {
                segmentReferences[segmentName] = refs[0];
            }
        }
        return ok(segmentReferences);
    }

    // Multiple references mode - get from metadata field
    const suborganismField = schema.suborganismIdentifierField;
    if (suborganismField === undefined) {
        return err({
            type: 'about:blank',
            title: 'Invalid configuration',
            status: 0,
            detail: `No 'suborganismIdentifierField' has been configured in the schema for organism ${schema.organismName}`,
            instance: '/seq/' + accessionVersion,
        });
    }

    const value = details[suborganismField];
    const suborganismResult = z.string().nullable().safeParse(value);
    if (!suborganismResult.success) {
        return err({
            type: 'about:blank',
            title: 'Invalid suborganism field',
            status: 0,
            detail: `Value '${value}' of field '${suborganismField}' is not a valid string or null.`,
            instance: '/seq/' + accessionVersion,
        });
    }

    const referenceName = suborganismResult.data;
    if (referenceName === null) {
        return ok(null);
    }

    // Validate that the reference exists in at least one segment
    let foundInAnySegment = false;
    for (const segmentName of segments) {
        if (referenceName in (referenceGenomes[segmentName] ?? {})) {
            foundInAnySegment = true;
            break;
        }
    }

    if (!foundInAnySegment) {
        return err({
            type: 'about:blank',
            title: 'Invalid suborganism',
            status: 0,
            detail: `ReferenceName '${referenceName}' (value of field '${suborganismField}') not found in reference genomes.`,
            instance: '/seq/' + accessionVersion,
        });
    }

    // Build segment references - all segments use the same reference
    const segmentReferences: Record<string, string> = {};
    for (const segmentName of segments) {
        segmentReferences[segmentName] = referenceName;
    }

    return ok(segmentReferences);
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
    segmentReferences: Record<string, string> | null,
): TableDataEntry[] {
    const data: TableDataEntry[] = [
        {
            label: 'Substitutions',
            name: 'nucleotideSubstitutions',
            value: '',
            header: 'Nucleotide mutations',
            customDisplay: {
                type: 'badge',
                value: substitutionsMap(nucleotideMutations, segmentReferences),
            },
            type: { kind: 'mutation' },
        },
        {
            label: 'Deletions',
            name: 'nucleotideDeletions',
            value: deletionsToCommaSeparatedString(nucleotideMutations, segmentReferences),
            header: 'Nucleotide mutations',
            type: { kind: 'mutation' },
        },
        {
            label: 'Insertions',
            name: 'nucleotideInsertions',
            value: insertionsToCommaSeparatedString(nucleotideInsertions, segmentReferences),
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
                value: substitutionsMap(aminoAcidMutations, segmentReferences),
            },
            type: { kind: 'mutation' },
        },
        {
            label: 'Deletions',
            name: 'aminoAcidDeletions',
            value: deletionsToCommaSeparatedString(aminoAcidMutations, segmentReferences),
            header: 'Amino acid mutations',
            type: { kind: 'mutation' },
        },
        {
            label: 'Insertions',
            name: 'aminoAcidInsertions',
            value: insertionsToCommaSeparatedString(aminoAcidInsertions, segmentReferences),
            header: 'Amino acid mutations',
            type: { kind: 'mutation' },
        },
    ];
    return data;
}

function toTableData(
    config: Schema,
    segmentReferences: Record<string, string> | null,
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
            segmentReferences,
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
    segmentReferences: Record<string, string> | null,
): SegmentedMutations[] {
    const result: SegmentedMutations[] = [];
    const substitutionData = mutationData.filter((m) => m.mutationTo !== '-');

    const segmentMutationsMap = new Map<string, MutationBadgeData[]>();
    for (const entry of substitutionData) {
        const { sequenceName, mutationFrom, position, mutationTo } = entry;
        const sequenceDisplayName = computeSequenceDisplayName(sequenceName, segmentReferences);

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

function computeSequenceDisplayName(
    originalSequenceName: string | null,
    segmentReferences: Record<string, string> | null,
): string | null {
    if (originalSequenceName === null || segmentReferences === null) {
        return originalSequenceName;
    }

    // Try to strip any reference prefix from the sequence name
    for (const referenceName of Object.values(segmentReferences)) {
        // Check if the sequence name is just the reference (single segment case)
        if (originalSequenceName === referenceName) {
            return null;
        }

        // Try to strip the reference prefix
        const prefixToTrim = `${referenceName}-`;
        if (originalSequenceName.startsWith(prefixToTrim)) {
            return originalSequenceName.substring(prefixToTrim.length);
        }
    }

    return originalSequenceName;
}

function deletionsToCommaSeparatedString(
    mutationData: MutationProportionCount[],
    segmentReferences: Record<string, string> | null,
) {
    const segmentPositions = new Map<string | null, number[]>();
    mutationData
        .filter((m) => m.mutationTo === '-')
        .forEach((m) => {
            const segment = computeSequenceDisplayName(m.sequenceName, segmentReferences);
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

function insertionsToCommaSeparatedString(
    insertionData: InsertionCount[],
    segmentReferences: Record<string, string> | null,
) {
    return insertionData
        .map((insertion) => {
            const sequenceDisplayName = computeSequenceDisplayName(insertion.sequenceName, segmentReferences);

            const sequenceNamePart = sequenceDisplayName !== null ? sequenceDisplayName + ':' : '';
            return `ins_${sequenceNamePart}${insertion.position}:${insertion.insertedSymbols}`;
        })
        .join(', ');
}
