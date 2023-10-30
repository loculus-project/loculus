import { sentenceCase } from 'change-case';
import { err, Result } from 'neverthrow';

import type { LapisClient } from '../../services/lapisClient.ts';
import type { ProblemDetail } from '../../types/backend.ts';
import type { Config } from '../../types/config.ts';
import type { Details, DetailsResponse, InsertionCount, MutationProportionCount } from '../../types/lapis.ts';

export async function getTableData(sequenceVersion: string, config: Config, lapisClient: LapisClient) {
    return Promise.all([
        lapisClient.getSequenceDetails(sequenceVersion),
        lapisClient.getSequenceMutations(sequenceVersion, 'nucleotide'),
        lapisClient.getSequenceMutations(sequenceVersion, 'aminoAcid'),
        lapisClient.getSequenceInsertions(sequenceVersion, 'nucleotide'),
        lapisClient.getSequenceInsertions(sequenceVersion, 'aminoAcid'),
    ])
        .then((results) => Result.combine(results))
        .then(validateDetailsAreNotEmpty(sequenceVersion))
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
                .map(toTableData(config)),
        );
}

function validateDetailsAreNotEmpty<T extends [DetailsResponse, ...any[]]>(sequenceVersion: string) {
    return (result: Result<T, ProblemDetail>): Result<T, ProblemDetail> => {
        if (result.isOk()) {
            const detailsResult = result.value[0];
            if (detailsResult.data.length === 0) {
                return err({
                    type: 'about:blank',
                    title: 'Not Found',
                    status: 0,
                    detail: 'No data found for sequence version ' + sequenceVersion,
                    instance: '/sequences/' + sequenceVersion,
                });
            }
        }
        return result;
    };
}

function toTableData(config: Config) {
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
        const tableData = config.schema.metadata.map((metadata) => ({
            label: sentenceCase(metadata.name),
            value: details[metadata.name] ?? 'N/A',
        }));
        tableData.push(
            {
                label: 'Nucleotide substitutions',
                value: mutationsToCommaSeparatedString(nucleotideMutations, (m) => !m.endsWith('-')),
            },
            {
                label: 'Nucleotide deletions',
                value: mutationsToCommaSeparatedString(nucleotideMutations, (m) => m.endsWith('-')),
            },
            {
                label: 'Nucleotide insertions',
                value: insertionsToCommaSeparatedString(nucleotideInsertions),
            },
            {
                label: 'Amino acid substitutions',
                value: mutationsToCommaSeparatedString(aminoAcidMutations, (m) => !m.endsWith('-')),
            },
            {
                label: 'Amino acid deletions',
                value: mutationsToCommaSeparatedString(aminoAcidMutations, (m) => m.endsWith('-')),
            },
            {
                label: 'Amino acid insertions',
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
