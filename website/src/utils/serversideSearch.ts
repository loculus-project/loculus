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

const INCLUDE_QUERY_KEY = 'include';

export const performLapisSearchQueries = async (
    state: QueryState,
    schema: Schema,
    referenceGenomesInfo: ReferenceGenomesInfo,
    organism: string,
    hiddenFieldValues: FieldValues = {},
): Promise<SearchResponse> => {
    const selectedReferences = schema.referenceIdentifierField
        ? getSelectedReferences({
              referenceGenomesInfo,
              referenceIdentifierField: schema.referenceIdentifierField,
              state,
          })
        : undefined;

    const segmentAndGeneInfo = getSegmentAndGeneInfo(referenceGenomesInfo, selectedReferences);

    const filterSchema = new MetadataFilterSchema(schema.metadata, schema.multiFieldSearches);
    const fieldValues = filterSchema.getFieldValuesFromQuery(state, hiddenFieldValues, referenceGenomesInfo);
    const fieldFilter = new FieldFilterSet(
        filterSchema,
        fieldValues,
        hiddenFieldValues,
        segmentAndGeneInfo,
        referenceGenomesInfo,
    );
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

    // The search page applies query-service's implicit defaults
    // (`versionStatus=LATEST_VERSION`, `isRevocation=false`) unless the user
    // has explicitly asked otherwise via `?include=all` (see the
    // "Include older versions and revocations" toggle in SearchFullUI).
    const includeRaw = state[INCLUDE_QUERY_KEY];
    const include = Array.isArray(includeRaw) ? includeRaw[0] : includeRaw;
    const organismQueries = include
        ? { queries: { organism: client.organism, include } }
        : { queries: { organism: client.organism } };
    const [detailsResult, aggregatedResult] = await Promise.all([
        client.call(
            'details',
            // @ts-expect-error because OrderBy typing does not accept this for unknown reasons
            {
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
            },
            organismQueries,
        ),
        client.call(
            'aggregated',
            {
                ...lapisSearchParameters,
                fields: [],
            },
            organismQueries,
        ),
    ]);

    return {
        data: detailsResult.unwrapOr({ data: [] }).data as TableSequenceData[],
        totalCount: aggregatedResult.unwrapOr({ data: [{ count: 0 }] }).data[0].count,
    };
};
