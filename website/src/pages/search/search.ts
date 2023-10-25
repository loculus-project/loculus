import type { TableSequenceData } from '../../components/SearchPage/Table';
import { getConfig, getRuntimeConfig } from '../../config';
import { getInstanceLogger } from '../../logger';
import type { Filter } from '../../types';

const logger = getInstanceLogger('search.ts');

export enum SearchStatus {
    OK,
    ERROR,
}

export type SearchResponse = {
    status: SearchStatus;
    data: TableSequenceData[];
    totalCount: number;
};
export const getData = async (metadataFilter: Filter[], offset: number, limit: number): Promise<SearchResponse> => {
    const searchFilters = metadataFilter
        .filter((metadata) => metadata.filterValue !== '')
        .reduce((acc: Record<string, string>, metadata) => {
            acc[metadata.name] = metadata.filterValue;
            return acc;
        }, {});

    const serverConfig = getRuntimeConfig().forServer;
    const detailsQuery = `${serverConfig.lapisUrl}/details`;
    const totalCountQuery = `${serverConfig.lapisUrl}/aggregated`;

    const headers = {
        'Content-Type': 'application/json',
    };

    const config = getConfig();

    try {
        const [detailsResponse, totalCountResponse] = await Promise.all([
            fetch(detailsQuery, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    fields: [...config.schema.tableColumns, config.schema.primaryKey],
                    limit,
                    offset,
                    ...searchFilters,
                }),
            }),
            fetch(totalCountQuery, {
                method: 'POST',
                headers,
                body: JSON.stringify(searchFilters),
            }),
        ]);

        if (!detailsResponse.ok) {
            logger.error(
                `Failed to fetch details with status ${detailsResponse.status}: ${await detailsResponse.text()}`,
            );
        }

        if (!totalCountResponse.ok) {
            logger.error(
                `Failed to fetch total count with status ${
                    totalCountResponse.status
                }: ${await totalCountResponse.text()}`,
            );
        }

        return {
            status: detailsResponse.ok && totalCountResponse.ok ? SearchStatus.OK : SearchStatus.ERROR,
            data: (await detailsResponse.json()).data ?? [],
            totalCount: (await totalCountResponse.json()).data[0].count,
        };
    } catch (error) {
        logger.error(`Failed to fetch data with error ${(error as Error).message}: ${(error as Error).cause}`);
        return {
            status: SearchStatus.ERROR,
            data: [],
            totalCount: NaN,
        };
    }
};

export const getMetadataSettings = async (getSearchParams: (param: string) => string): Promise<Filter[]> => {
    const config = getConfig();
    return config.schema.metadata.flatMap((metadata) => {
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
