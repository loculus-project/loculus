import {
    getFieldValuesFromQuery,
    getLapisSearchParameters,
    ORDER_DIRECTION_KEY,
    ORDER_KEY,
    PAGE_KEY,
    getColumnVisibilitiesFromQuery,
} from './search';
import type { TableSequenceData } from '../components/SearchPage/Table';
import { LapisClient } from '../services/lapisClient';
import { pageSize } from '../settings';
import type { Schema } from '../types/config';
import type { ReferenceGenomesSequenceNames } from '../types/referencesGenomes';

// If these types are not already defined in the new file, you'll need to import or define them:
export type SearchResponse = {
    data: TableSequenceData[];
    totalCount: number;
};

export const performLapisSearchQueries = async (
    state: Record<string, string>,
    schema: Schema,
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames,
    hiddenFieldValues: Record<string, any>,
    organism: string,
): Promise<SearchResponse> => {
    const fieldValues = getFieldValuesFromQuery(state, hiddenFieldValues, schema);
    const lapisSearchParameters = getLapisSearchParameters(fieldValues, referenceGenomesSequenceNames);

    console.log('lapisParams', lapisSearchParameters);

    const orderByField = state[ORDER_KEY] ?? schema.defaultOrderBy ?? schema.primaryKey;
    const orderDirection = state[ORDER_DIRECTION_KEY] ?? schema.defaultOrder ?? 'ascending';
    const page = state[PAGE_KEY] ? parseInt(state[PAGE_KEY]) : 1;

    const columnVisibilities = getColumnVisibilitiesFromQuery(schema, state);

    const columnsToShow = schema.metadata
        .filter((field) => columnVisibilities.get(field.name) === true)
        .map((field) => field.name);

    const client = LapisClient.createForOrganism(organism);

    const [detailsResult, aggregatedResult] = await Promise.all([
        client.call('details', {
            ...lapisSearchParameters,
            fields: [...columnsToShow, schema.primaryKey],
            limit: pageSize,
            offset: (page - 1) * pageSize,
            orderBy: [
                {
                    field: orderByField,
                    type: orderDirection,
                },
            ],
        }),
        client.call('aggregated', {
            ...lapisSearchParameters,
            fields: [],
        }),
    ]);

    return {
        data: detailsResult.unwrapOr({ data: [] }).data as TableSequenceData[],
        totalCount: aggregatedResult.unwrapOr({ data: [{ count: 0 }] }).data[0].count,
    };
};
