import { ok } from 'neverthrow';
import type { Result } from 'neverthrow';

import { getConfiguredOrganisms, getSchema } from '../../config.ts';
import { LapisClient } from '../../services/lapisClient.ts';
import { ACCESSION_VERSION_FIELD } from '../../settings.ts';
import type { ProblemDetail } from '../../types/backend.ts';
import { type Schema } from '../../types/config.ts';

type AggregateValue = string | number | boolean | null;
export type AggregateRow = { value: AggregateValue; count: number };

const getAggregate = async (
    client: LapisClient,
    schema: Schema,
    accessions: string[],
    field: string,
): Promise<Result<AggregateRow[], ProblemDetail>> => {
    if (accessions.length === 0 || !schema.metadata.some((f) => f.name === field)) {
        return ok([]);
    }
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
    field: string,
): Promise<Result<AggregateRow[], ProblemDetail>> => {
    if (accessions.length === 0) {
        return ok([]);
    }

    const organisms = getConfiguredOrganisms();
    const aggregates = await Promise.all(
        organisms.map((organism) => {
            const client = LapisClient.createForOrganism(organism.key);
            const schema = getSchema(organism.key);
            return getAggregate(client, schema, accessions, field);
        }),
    );

    const crossAggregate = new Map<AggregateValue, number>();
    for (const aggregate of aggregates) {
        if (aggregate.isErr()) continue;

        for (const item of aggregate.value) {
            crossAggregate.set(item.value, (crossAggregate.get(item.value) ?? 0) + item.count);
        }
    }

    return ok(Array.from(crossAggregate.entries()).map(([value, count]) => ({ value, count })));
};
