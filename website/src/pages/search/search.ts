import type { TableSequenceData } from '../../components/SearchPage/Table';
import { getConfig } from '../../config';
import type { Filter } from '../../types';

export enum SearchStatus {
    OK,
    ERROR,
    READY,
}

export type SearchResponse = {
    status: SearchStatus;
    data: TableSequenceData[];
    totalCount: number;
};
export const getData = async (metadataFilter: Filter[], offset: number, limit: number): Promise<SearchResponse> => {
    const config = getConfig();
    const searchFilters = metadataFilter
        .filter((metadata) => metadata.filter !== '')
        .reduce((acc: Record<string, string>, metadata) => {
            acc[metadata.name] = metadata.filter;
            return acc;
        }, {});

    // TODO: when switching to LAPISv2 limit and offset should be handled differently
    const detailsQuery = `${config.lapisHost}/details?limit=${limit}&offset=${offset}`;
    const totalCountQuery = `${config.lapisHost}/aggregated`;

    const headers = {
        'Content-Type': 'application/json',
    };

    try {
        const [detailsResponse, totalCountResponse] = await Promise.all([
            fetch(detailsQuery, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    fields: [...config.schema.tableColumns, config.schema.primaryKey],
                    ...searchFilters,
                }),
            }),
            fetch(totalCountQuery, {
                method: 'POST',
                headers,
                body: JSON.stringify(searchFilters),
            }),
        ]);

        return {
            status: detailsResponse.ok && totalCountResponse.ok ? SearchStatus.OK : SearchStatus.ERROR,
            data: (await detailsResponse.json()).data ?? [],
            totalCount: (await totalCountResponse.json()).data[0].count,
        };
    } catch {
        return {
            status: SearchStatus.ERROR,
            data: [],
            totalCount: NaN,
        };
    }
};
