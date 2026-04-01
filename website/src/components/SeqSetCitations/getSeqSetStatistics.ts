import { ok } from 'neverthrow';
import type { Result } from 'neverthrow';

import { getConfiguredOrganisms, getSchema } from '../../config.ts';
import { LapisClient } from '../../services/lapisClient.ts';
import { ACCESSION_VERSION_FIELD } from '../../settings.ts';
import type { ProblemDetail } from '../../types/backend.ts';

type AggregateValue = string | number | boolean | null | undefined;
export type AggregateRow = { value: AggregateValue; count: number };

const getAggregate = async (
    client: LapisClient,
    accessions: string[],
    field: string,
): Promise<Result<AggregateRow[], ProblemDetail>> => {
    const result = await client.call('aggregated', {
        [ACCESSION_VERSION_FIELD]: accessions,
        fields: [field],
    });

    return result.map(({ data }) =>
        data.map((item) => ({
            value: item[field],
            count: item.count,
        })),
    );
};

export const getSeqSetStatistics = async (
    accessions: string[],
    fieldOptions: string[],
): Promise<Result<AggregateRow[], ProblemDetail>> => {
    if (accessions.length === 0) {
        return ok([]);
    }

    const organisms = getConfiguredOrganisms();
    const aggregateResponses = await Promise.all(
        organisms.map((organism) => {
            const client = LapisClient.createForOrganism(organism.key);
            const schema = getSchema(organism.key);
            const field = fieldOptions.find((option) => schema.metadata.some((f) => f.name === option));
            if (!field) return Promise.resolve(ok([]));
            return getAggregate(client, accessions, field);
        }),
    );

    const crossAggregate = new Map<AggregateValue, number>();
    for (const aggregateResponse of aggregateResponses) {
        if (aggregateResponse.isErr()) return aggregateResponse;

        for (const aggregateRow of aggregateResponse.value) {
            crossAggregate.set(aggregateRow.value, (crossAggregate.get(aggregateRow.value) ?? 0) + aggregateRow.count);
        }
    }

    return ok(Array.from(crossAggregate.entries()).map(([value, count]) => ({ value, count })));
};
