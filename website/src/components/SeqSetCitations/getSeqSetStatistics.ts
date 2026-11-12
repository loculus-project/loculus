import { Zodios } from '@zodios/core';

import { lapisApi } from '../../services/lapisApi.ts';
import { ACCESSION_FIELD, ACCESSION_VERSION_FIELD, VERSION_STATUS_FIELD } from '../../settings.ts';
import { type LapisBaseRequest, versionStatuses } from '../../types/lapis.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

type AggregateValue = string | number | boolean | null | undefined;
export type AggregateRow = { value: AggregateValue; count: number };

const getAggregate = async (lapisUrl: string, field: string, params: LapisBaseRequest): Promise<AggregateRow[]> => {
    const client = new Zodios(lapisUrl, lapisApi, { transform: false });
    const response = await client.aggregated(params);
    return response.data.map((item) => ({
        value: item[field],
        count: item.count,
    }));
};

/**
 * Fetches aggregates for the accessions across all organisms in organismFields, and combines them into a single aggregate result.
 * organismFields maps each organism to the field to aggregate on for that organism.
 */
export const getSeqSetStatistics = async (
    accessions: string[],
    organismFields: Record<string, string>,
    clientConfig: ClientConfig,
): Promise<AggregateRow[]> => {
    if (accessions.length === 0) {
        return [];
    }

    // Split accessions into versioned (contain '.') and unversioned (no '.')
    const versionedAccessions = accessions.filter((acc) => acc.includes('.'));
    const unversionedAccessions = accessions.filter((acc) => !acc.includes('.'));

    const aggregateResponses = await Promise.all(
        Object.entries(organismFields).flatMap(([organism, field]) => {
            const lapisUrl = clientConfig.lapisUrls[organism];

            // Fetch aggregates for both versioned and unversioned accessions
            const aggregates = [];
            if (versionedAccessions.length > 0) {
                aggregates.push(
                    getAggregate(lapisUrl, field, {
                        [ACCESSION_VERSION_FIELD]: versionedAccessions,
                        fields: [field],
                    }),
                );
            }
            if (unversionedAccessions.length > 0) {
                aggregates.push(
                    getAggregate(lapisUrl, field, {
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
        for (const aggregateRow of aggregateResponse) {
            crossAggregate.set(aggregateRow.value, (crossAggregate.get(aggregateRow.value) ?? 0) + aggregateRow.count);
        }
    }

    return Array.from(crossAggregate.entries()).map(([value, count]) => ({ value, count }));
};
