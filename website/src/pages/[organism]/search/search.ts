import { ok, Result } from 'neverthrow';

import type { TableSequenceData } from '../../../components/SearchPage/Table.tsx';
import { getSchema } from '../../../config.ts';
import { LapisClient } from '../../../services/lapisClient.ts';
import { hiddenDefaultSearchFilters } from '../../../settings.ts';
import type { ProblemDetail } from '../../../types/backend.ts';
import type { Filter } from '../../../types/config.ts';

export type SearchResponse = {
    data: TableSequenceData[];
    totalCount: number;
};

function addHiddenFilters(searchFormFilter: Filter[], hiddenFilters: Filter[]) {
    const searchFormFilterNames = searchFormFilter.map((filter) => filter.name);
    const hiddenFiltersToAdd = hiddenFilters.filter((filter) => !searchFormFilterNames.includes(filter.name));
    return [...searchFormFilter, ...hiddenFiltersToAdd];
}

export const getData = async (
    organism: string,
    searchFormFilter: Filter[],
    offset: number,
    limit: number,
    hiddenDefaultFilters: Filter[] = hiddenDefaultSearchFilters,
): Promise<Result<SearchResponse, ProblemDetail>> => {
    const filters = addHiddenFilters(searchFormFilter, hiddenDefaultFilters);

    const searchFilters = filters
        .filter((metadata) => metadata.filterValue !== '')
        .reduce((acc: Record<string, string>, metadata) => {
            acc[metadata.name] = metadata.filterValue;
            return acc;
        }, {});

    const config = getSchema(organism);

    const lapisClient = LapisClient.createForOrganism(organism);

    const aggregateResult = await lapisClient.call('aggregated', searchFilters);

    if (aggregateResult.isOk() && aggregateResult.value.data[0].count === 0) {
        return ok({
            data: [],
            totalCount: 0,
        });
    }

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

export const getSearchFormFilters = (getSearchParams: (param: string) => string, organism: string): Filter[] => {
    const schema = getSchema(organism);
    return schema.metadata.flatMap((metadata) => {
        if (metadata.notSearchable === true) {
            return [];
        }
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
