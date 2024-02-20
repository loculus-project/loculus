import { ok, Result } from 'neverthrow';

import type { TableSequenceData } from '../components/SearchPage/Table.tsx';
import { getReferenceGenomes, getSchema } from '../config.ts';
import { LapisClient } from '../services/lapisClient.ts';
import { GROUP_FIELD } from '../settings.ts';
import type { ProblemDetail } from '../types/backend.ts';
import type { MetadataFilter, MutationFilter } from '../types/config.ts';
import { type LapisBaseRequest, type OrderBy, type OrderByType, orderByType } from '../types/lapis.ts';
import type { ReferenceGenomesSequenceNames } from '../types/referencesGenomes.ts';
export type SearchResponse = {
    data: TableSequenceData[];
    totalCount: number;
};

export function addHiddenFilters(searchFormFilter: MetadataFilter[], hiddenFilters: MetadataFilter[]) {
    const searchFormFilterNames = searchFormFilter.map((filter) => filter.name);
    const hiddenFiltersToAdd = hiddenFilters.filter((filter) => !searchFormFilterNames.includes(filter.name));
    return [...searchFormFilter, ...hiddenFiltersToAdd];
}

export const getData = async (
    organism: string,
    metadataFilter: MetadataFilter[],
    mutationFilter: MutationFilter,
    offset: number,
    limit: number,
    orderBy?: OrderBy,
): Promise<Result<SearchResponse, ProblemDetail>> => {
    const metadataSearchFilters = metadataFilter
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

export const getMetadataFilters = (
    getSearchParams: (param: string) => string,
    organism: string,
    options: {exclude? : string[]} = {},
): MetadataFilter[] => {
    const schema = getSchema(organism);
    return schema.metadata.flatMap((metadata) => {
        if (metadata.notSearchable === true) {
            return [];
        }
        if (options.exclude && options.exclude.includes(metadata.name)) {
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
    getSearchParams: (param: string) => string,
    defaultOrderByField: string,
    defaultOrder: OrderByType,
): OrderBy => {
    const orderByTypeParam = getSearchParams('order');
    const orderByTypeParsed = orderByTypeParam !== '' ? orderByType.safeParse(orderByTypeParam) : undefined;
    const orderByTypeValue: OrderByType = orderByTypeParsed?.success === true ? orderByTypeParsed.data : defaultOrder;
    const sortByField = getSearchParams('orderBy') ? getSearchParams('orderBy') : defaultOrderByField;
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
