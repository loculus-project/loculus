import { ok, Result } from 'neverthrow';

import type { TableSequenceData } from '../../../components/SearchPage/Table.tsx';
import { getReferenceGenomes, getSchema } from '../../../config.ts';
import { LapisClient } from '../../../services/lapisClient.ts';
import { hiddenDefaultSearchFilters } from '../../../settings.ts';
import type { ProblemDetail } from '../../../types/backend.ts';
import type { FilterValue, MetadataFilter, MutationFilter } from '../../../types/config.ts';
import { type LapisBaseRequest, type OrderBy, type OrderByType, orderByType } from '../../../types/lapis.ts';
import type { ReferenceGenomesSequenceNames } from '../../../types/referencesGenomes.ts';

export type SearchResponse = {
    data: TableSequenceData[];
    totalCount: number;
};

function addHiddenFilters(searchFormFilter: FilterValue[], hiddenFilters: FilterValue[]) {
    const searchFormFilterNames = searchFormFilter.map((filter) => filter.name);
    const hiddenFiltersToAdd = hiddenFilters.filter((filter) => !searchFormFilterNames.includes(filter.name));
    return [...searchFormFilter, ...hiddenFiltersToAdd];
}

export const getData = async (
    organism: string,
    metadataFilter: FilterValue[],
    mutationFilter: MutationFilter,
    offset: number,
    limit: number,
    orderBy?: OrderBy,
    hiddenDefaultFilters: FilterValue[] = hiddenDefaultSearchFilters,
): Promise<Result<SearchResponse, ProblemDetail>> => {
    const filters = addHiddenFilters(metadataFilter, hiddenDefaultFilters);

    const metadataSearchFilters = filters
        .filter((metadata) => metadata.filterValue !== '')
        .reduce((acc: Record<string, string>, metadata) => {
            acc[metadata.name] = metadata.filterValue;
            return acc;
        }, {});
    const searchFilters = {
        ...metadataSearchFilters,
        nucleotideMutations: mutationFilter.nucleotideMutationQueries ?? [],
        aminoAcidMutations: mutationFilter.aminoAcidMutationQueries ?? [],
        nucleotideInsertions: mutationFilter.nucleotideInsertionQueries ?? [],
        aminoAcidInsertions: mutationFilter.aminoAcidInsertionQueries ?? [],
    };

    const config = getSchema(organism);

    const lapisClient = LapisClient.createForOrganism(organism);

    const aggregateResult = await lapisClient.call('aggregated', searchFilters);

    if (aggregateResult.isOk() && aggregateResult.value.data[0].count === 0) {
        return ok({
            data: [],
            totalCount: 0,
        });
    }

    // @ts-expect-error Bug in Zod: https://github.com/colinhacks/zod/issues/3136
    const request: LapisBaseRequest = {
        fields: [...config.tableColumns, config.primaryKey],
        limit,
        offset,
        ...metadataSearchFilters,
        orderBy: orderBy !== undefined ? [orderBy] : undefined,
    };

    const detailsResult = await lapisClient.call('details', request);

    return Result.combine([detailsResult, aggregateResult]).map(([details, aggregate]) => {
        return {
            data: details.data,
            totalCount: aggregate.data[0].count,
        };
    });
};

export const getMetadataFilters = (getSearchParams: (param: string) => string, organism: string): MetadataFilter[] => {
    const schema = getSchema(organism);
    return schema.metadata.flatMap((metadata) => {
        if (metadata.notSearchable === true) {
            return [];
        }

        if (metadata.type === 'date' || metadata.type === 'timestamp') {
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
        }

        return [
            {
                ...metadata,
                filterValue: getSearchParams(metadata.name),
            },
        ];
    });
};

export const getOrderBy = (
    searchParams: URLSearchParams,
    defaultOrderByField: string,
    defaultOrder: OrderByType,
): OrderBy => {
    const orderByTypeParam = searchParams.get('order');
    const orderByTypeParsed = orderByTypeParam !== null ? orderByType.safeParse(orderByTypeParam) : undefined;
    const orderByTypeValue: OrderByType = orderByTypeParsed?.success === true ? orderByTypeParsed.data : defaultOrder;
    const sortByField = searchParams.get('orderBy') ?? defaultOrderByField;
    return {
        field: sortByField,
        type: orderByTypeValue,
    };
};

export const getMutationFilter = (searchParams: URLSearchParams): MutationFilter => {
    return {
        nucleotideMutationQueries: searchParams.get('nucleotideMutations')?.split(','),
        aminoAcidMutationQueries: searchParams.get('aminoAcidMutations')?.split(','),
        nucleotideInsertionQueries: searchParams.get('nucleotideInsertions')?.split(','),
        aminoAcidInsertionQueries: searchParams.get('aminoAcidInsertions')?.split(','),
    };
};

export const getReferenceGenomesSequenceNames = (organism: string): ReferenceGenomesSequenceNames => {
    const referenceGenomes = getReferenceGenomes(organism);
    return {
        nucleotideSequences: referenceGenomes.nucleotideSequences.map((n) => n.name),
        genes: referenceGenomes.genes.map((n) => n.name),
    };
};
