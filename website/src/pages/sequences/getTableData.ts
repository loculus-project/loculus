import { sentenceCase } from 'change-case';

import { fetchInsertions, fetchMutations, fetchSequenceDetails } from '../../api';
import type { Config, InsertionCount, MutationProportionCount, RuntimeConfig } from '../../types';

export async function getTableData(accession: string, config: Config, runtimeConfig: RuntimeConfig) {
    const [data, nucMutations, nucInsertions, aaMutations, aaInsertions] = await Promise.all([
        fetchSequenceDetails(accession, config, runtimeConfig),
        fetchMutations(accession, 'nucleotide', config, runtimeConfig),
        fetchInsertions(accession, 'nucleotide', config, runtimeConfig),
        fetchMutations(accession, 'aminoAcid', config, runtimeConfig),
        fetchInsertions(accession, 'aminoAcid', config, runtimeConfig),
    ]);

    if (data === undefined) {
        return undefined;
    }

    const tableData: { label: string; value: string }[] = [];
    config.schema.metadata.forEach((metadata) => {
        tableData.push({
            label: sentenceCase(metadata.name),
            value: data[metadata.name] ?? 'N/A',
        });
    });
    tableData.push(
        {
            label: 'Nucleotide substitutions',
            value: mutationsToCommaSeparatedString(nucMutations, (m) => !m.endsWith('-')),
        },
        {
            label: 'Nucleotide deletions',
            value: mutationsToCommaSeparatedString(nucMutations, (m) => m.endsWith('-')),
        },
        { label: 'Nucleotide insertions', value: insertionsToCommaSeparatedString(nucInsertions) },
        {
            label: 'Amino acid substitutions',
            value: mutationsToCommaSeparatedString(aaMutations, (m) => !m.endsWith('-')),
        },
        {
            label: 'Amino acid deletions',
            value: mutationsToCommaSeparatedString(aaMutations, (m) => m.endsWith('-')),
        },
        { label: 'Amino acid insertions', value: insertionsToCommaSeparatedString(aaInsertions) },
    );

    return tableData;
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
