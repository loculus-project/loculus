import type { TableSequenceData } from '../../components/SearchPage/Table';
import { getConfig } from '../../config';
import type { Filter } from '../../types';

export enum SearchStatus {
    OK,
    ERROR,
}

export type SearchResponse = {
    status: SearchStatus;
    data: TableSequenceData[];
};
export const getData = async (metadataFilter: Filter[]): Promise<SearchResponse> => {
    const config = getConfig();
    const searchFilters = metadataFilter
        .filter((metadata) => metadata.filter !== '')
        .reduce((acc: Record<string, string>, metadata) => {
            acc[metadata.name] = metadata.filter;
            return acc;
        }, {});

    // TODO: when switching to LAPISv2 limit should be handled differently
    const query = `${config.lapisHost}/details?limit=100`;

    const body = JSON.stringify({
        fields: [...config.schema.tableColumns, config.schema.primaryKey],
        ...searchFilters,
    });

    const response = await fetch(query, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body,
    });

    return {
        status: response.ok ? SearchStatus.OK : SearchStatus.ERROR,
        data: (await response.json()).data ?? [],
    };
};
