import { Result } from 'neverthrow';

import type { TableSequenceData } from '../../../components/SearchPage/Table.tsx';
import { getConfig } from '../../../config.ts';
import { LapisClient } from '../../../services/lapisClient.ts';
import type { ProblemDetail } from '../../../types/backend.ts';
import type { Filter } from '../../../types/config.ts';

export type SearchResponse = {
    data: TableSequenceData[];
    totalCount: number;
};
export const getData = async (
    organism: string,
    metadataFilter: Filter[],
    offset: number,
    limit: number,
): Promise<Result<SearchResponse, ProblemDetail>> => {
    const searchFilters = metadataFilter
        .filter((metadata) => metadata.filterValue !== '')
        .reduce((acc: Record<string, string>, metadata) => {
            acc[metadata.name] = metadata.filterValue;
            return acc;
        }, {});

    const config = getConfig();

    const lapisClient = LapisClient.createForOrganism(organism);

    const aggregateResult = await lapisClient.call('aggregated', searchFilters);
    const detailsResult = await lapisClient.call('details', {
        fields: [...config.tableColumns, config.primaryKey],
        limit,
        offset,
        ...searchFilters,
    });

    return Result.combine([detailsResult, aggregateResult]).map(([details, aggregate]) => {
        return {
            data: details.data,
            totalCount: aggregate.data[0].count,
        };
    });
};

export const getMetadataSettings = async (getSearchParams: (param: string) => string): Promise<Filter[]> => {
    const config = getConfig();
    return config.metadata.flatMap((metadata) => {
        if (metadata.type === 'date') {
            const metadataFrom = {
                ...metadata,
                name: `${metadata.name}From`,
                filterValue: getSearchParams(`${metadata.name}From`),
            };
            const metadataTo = {
                ...metadata,
                name: `${metadata.name}To`,
                filterValue: getSearchParams(`${metadata.name}To`),
            };
            return [metadataFrom, metadataTo];
        } else {
            const metadataSetting = {
                ...metadata,
                filterValue: getSearchParams(metadata.name),
            };
            return [metadataSetting];
        }
    });
};
