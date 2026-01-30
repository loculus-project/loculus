import { validateSingleValue } from './extractFieldValue';
import { getSelectedReferences } from './referenceSelection.ts';
import {
    getColumnVisibilitiesFromQuery,
    MetadataFilterSchema,
    ORDER_DIRECTION_KEY,
    ORDER_KEY,
    PAGE_KEY,
    type SearchResponse,
} from './search';
import { getSegmentAndGeneInfo } from './sequenceTypeHelpers.ts';
import { FieldFilterSet } from '../components/SearchPage/DownloadDialog/SequenceFilters';
import type { TableSequenceData } from '../components/SearchPage/Table';
import type { QueryState } from '../components/SearchPage/useStateSyncedWithUrlQueryParams.ts';
import { LapisClient } from '../services/lapisClient';
import { pageSize } from '../settings';
import type { FieldValues, Schema } from '../types/config';
import type { ReferenceGenomesInfo } from '../types/referencesGenomes.ts';

export const performLapisSearchQueries = async (
    state: QueryState,
    schema: Schema,
    referenceGenomesInfo: ReferenceGenomesInfo,
    hiddenFieldValues: FieldValues,
    organism: string,
): Promise<SearchResponse> => {
    const selectedReferences = schema.referenceIdentifierField
        ? getSelectedReferences({
              referenceGenomesInfo,
              referenceIdentifierField: schema.referenceIdentifierField,
              state,
          })
        : undefined;

    const suborganismSegmentAndGeneInfo = getSegmentAndGeneInfo(referenceGenomesInfo, selectedReferences);

    const filterSchema = new MetadataFilterSchema(schema.metadata);
    const fieldValues = filterSchema.getFieldValuesFromQuery(state, hiddenFieldValues);
    const fieldFilter = new FieldFilterSet(filterSchema, fieldValues, hiddenFieldValues, suborganismSegmentAndGeneInfo);
    const lapisSearchParameters = fieldFilter.toApiParams();

    // Extract single-value parameters using validation
    const orderByField = ORDER_KEY in state ? validateSingleValue(state[ORDER_KEY], ORDER_KEY) : schema.defaultOrderBy;
    const orderDirection =
        ORDER_DIRECTION_KEY in state
            ? validateSingleValue(state[ORDER_DIRECTION_KEY], ORDER_DIRECTION_KEY)
            : schema.defaultOrder;
    const pageParam = PAGE_KEY in state ? validateSingleValue(state[PAGE_KEY], PAGE_KEY) : '';
    const page = pageParam ? parseInt(pageParam, 10) : 1;

    const columnVisibilities = getColumnVisibilitiesFromQuery(schema, state);

    const columnsToShow = schema.metadata
        .filter(
            (field) => columnVisibilities.get(field.name)?.isVisible(referenceGenomesInfo, selectedReferences) === true,
        )
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
