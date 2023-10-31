import { sentenceCase } from 'change-case';
import { err, Result } from 'neverthrow';

import {
    type LapisClient,
    siloVersionStatuses,
    type SiloVersionStatus,
    isSiloVersionStatus,
} from '../../../services/lapisClient.ts';
import type { ProblemDetail } from '../../../types/backend.ts';
import type { Schema } from '../../../types/config.ts';
import type { Details, DetailsResponse, InsertionCount, MutationProportionCount } from '../../../types/lapis.ts';

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

export function getVersionStatus(tableData: TableDataEntry[]): SiloVersionStatus {
    const versionStatus = tableData.find((pred) => pred.name === 'versionStatus')?.value.toString() ?? undefined;

    if (isSiloVersionStatus(versionStatus) === false) {
        throw new Error(
            'Invalid version status: ' +
                JSON.stringify(versionStatus) +
                ' not in ' +
                JSON.stringify(Object.values(siloVersionStatuses)),
        );
    }

    return versionStatus as SiloVersionStatus;
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
                    instance: '/sequences/' + accessionVersion,
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
    }) => {
        const tableData = config.metadata.map((metadata) => ({
            label: sentenceCase(metadata.name),
            name: metadata.name,
            value: details[metadata.name] ?? 'N/A',
        }));
        tableData.push(
            {
                label: 'Nucleotide substitutions',
                name: 'nucleotideSubstitutions',
                value: mutationsToCommaSeparatedString(nucleotideMutations, (m) => !m.endsWith('-')),
            },
            {
                label: 'Nucleotide deletions',
                name: 'nucleotideDeletions',
                value: mutationsToCommaSeparatedString(nucleotideMutations, (m) => m.endsWith('-')),
            },
            {
                label: 'Nucleotide insertions',
                name: 'nucleotideInsertions',
                value: insertionsToCommaSeparatedString(nucleotideInsertions),
            },
            {
                label: 'Amino acid substitutions',
                name: 'aminoAcidSubstitutions',
                value: mutationsToCommaSeparatedString(aminoAcidMutations, (m) => !m.endsWith('-')),
            },
            {
                label: 'Amino acid deletions',
                name: 'aminoAcidDeletions',
                value: mutationsToCommaSeparatedString(aminoAcidMutations, (m) => m.endsWith('-')),
            },
            {
                label: 'Amino acid insertions',
                name: 'aminoAcidInsertions',
                value: insertionsToCommaSeparatedString(aminoAcidInsertions),
            },
        );
        return tableData;
    };
}

function mutationsToCommaSeparatedString(
    mutationData: MutationProportionCount[],
    filter: (mutation: string) => boolean,
) {
    return mutationData
        .map((m) => m.mutation)
        .filter(filter)
        .join(', ');
}

function insertionsToCommaSeparatedString(insertionData: InsertionCount[]) {
    return insertionData.map((m) => m.insertion).join(', ');
}
