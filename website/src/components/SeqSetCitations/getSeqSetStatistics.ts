import { ok } from 'neverthrow';
import type { Result } from 'neverthrow';

import { getConfiguredOrganisms, getSchema } from '../../config.ts';
import { LapisClient } from '../../services/lapisClient.ts';
import { ACCESSION_FIELD, ACCESSION_VERSION_FIELD, VERSION_STATUS_FIELD } from '../../settings.ts';
import type { ProblemDetail } from '../../types/backend.ts';
import { versionStatuses } from '../../types/lapis.ts';

type AggregateValue = string | number | boolean | null | undefined;
export type AggregateRow = { value: AggregateValue; count: number };

const getAggregate = async (
    client: LapisClient,
    field: string,
    params: Record<string, string[] | string>,
): Promise<Result<AggregateRow[], ProblemDetail>> => {
    const result = await client.call('aggregated', params);
    return result.map(({ data }) =>
        data.map((item) => ({
            value: item[field],
            count: item.count,
        })),
    );
};

/**
 * Fetches aggregates for the accessions and field options across all organisms, and combines them into a single aggregate result.
 */
export const getSeqSetStatistics = async (
    accessions: string[],
    fieldOptions: string[],
): Promise<Result<AggregateRow[], ProblemDetail>> => {
    if (accessions.length === 0) {
        return ok([]);
    }

    // Split accessions into versioned (contain '.') and unversioned (no '.')
    const versionedAccessions = accessions.filter((acc) => acc.includes('.'));
    const unversionedAccessions = accessions.filter((acc) => !acc.includes('.'));

    const organisms = getConfiguredOrganisms();
    const aggregateResponses = await Promise.all(
        organisms.flatMap((organism) => {
            const client = LapisClient.createForOrganism(organism.key);
            const schema = getSchema(organism.key);

            // Find the first field option that exists in the schema metadata, and skip if none are found
            const field = fieldOptions.find((option) => schema.metadata.some((f) => f.name === option));
            if (!field) return [];

            // Fetch aggregates for both versioned and unversioned accessions
            const aggregates = [];
            if (versionedAccessions.length > 0) {
                aggregates.push(
                    getAggregate(client, field, {
                        [ACCESSION_VERSION_FIELD]: versionedAccessions,
                        fields: [field],
                    }),
                );
            }
            if (unversionedAccessions.length > 0) {
                aggregates.push(
                    getAggregate(client, field, {
                        [ACCESSION_FIELD]: unversionedAccessions,
                        [VERSION_STATUS_FIELD]: versionStatuses.latestVersion,
                        fields: [field],
                    }),
                );
            }

            return aggregates;
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
