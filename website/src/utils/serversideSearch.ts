import {
    ORDER_DIRECTION_KEY,
    ORDER_KEY,
    PAGE_KEY,
    getColumnVisibilitiesFromQuery,
    type SearchResponse,
    MetadataFilterSchema,
} from './search';
import { FieldFilterSet } from '../components/SearchPage/DownloadDialog/SequenceFilters';
import type { TableSequenceData } from '../components/SearchPage/Table';
import { LapisClient } from '../services/lapisClient';
import { pageSize } from '../settings';
import type { FieldValues, Schema } from '../types/config';
import type { ReferenceGenomesSequenceNames } from '../types/referencesGenomes';

export const performLapisSearchQueries = async (
    state: Record<string, string>,
    schema: Schema,
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames,
    hiddenFieldValues: FieldValues,
    organism: string,
): Promise<SearchResponse> => {
    const filterSchema = new MetadataFilterSchema(schema.metadata);
    const fieldValues = filterSchema.getFieldValuesFromQuery(state, hiddenFieldValues);
    const fieldFilter = new FieldFilterSet(filterSchema, fieldValues, hiddenFieldValues, referenceGenomesSequenceNames);
    const lapisSearchParameters = fieldFilter.toApiParams();

    const orderByField = ORDER_KEY in state ? state[ORDER_KEY] : schema.defaultOrderBy;
    const orderDirection = state[ORDER_DIRECTION_KEY] ?? schema.defaultOrder;
    const page = state[PAGE_KEY] ? parseInt(state[PAGE_KEY], 10) : 1;

    const columnVisibilities = getColumnVisibilitiesFromQuery(schema, state);

    const columnsToShow = schema.metadata
        .filter((field) => columnVisibilities.get(field.name) === true)
        .map((field) => field.name);

    const client = LapisClient.createForOrganism(organism);

    const [detailsResult, aggregatedResult] = await Promise.all([
        // @ts-expect-error because OrderBy typing does not accept this for unknown reasons
        client.call('details', {
            ...lapisSearchParameters,
            fields: [...columnsToShow, schema.primaryKey],
            limit: pageSize,
            offset: (page - 1) * pageSize,
            orderBy: [
                {
                    field: orderByField,
                    type: orderDirection === 'ascending' ? 'ascending' : 'descending',
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
