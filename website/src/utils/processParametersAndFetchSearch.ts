import { URLSearchParams } from 'url';

import type { AstroGlobal } from 'astro';

import {
    getData,
    getReferenceGenomesSequenceNames,
    getMetadataFilters,
    getMutationFilter,
    getOrderBy,
    addHiddenFilters,
} from './search';
import { cleanOrganism } from '../components/Navigation/cleanOrganism';
import { getSchema, getRuntimeConfig, getLapisUrl } from '../config';
import { GROUP_FIELD, hiddenDefaultSearchFilters, pageSize } from '../settings';

export async function processParametersAndFetchSearch(astro: AstroGlobal, groupForMySequences?: string) {
    const organism = astro.params.organism!;
    const { organism: cleanedOrganism } = cleanOrganism(organism);
    if (cleanedOrganism === undefined) {
        throw new Error(`Invalid organism: ${organism}`);
    }
    const schema = getSchema(organism);
    const clientConfig = getRuntimeConfig().public;
    const lapisUrl = getLapisUrl(clientConfig, organism);
    let postParams = new URLSearchParams();

    if (astro.request.method === 'POST') {
        const formData = await astro.request.text();
        const topParams = new URLSearchParams(formData);
        const searchQueries = new URLSearchParams(topParams.get('searchQuery') ?? '')
        postParams = new URLSearchParams([...topParams, ...searchQueries]);
        postParams.delete('searchQuery')
    }

    const getSearchParams = (field: string) => {
        const valueFromGet = astro.url.searchParams.get(field) ?? '';
        const value = valueFromGet !== '' ? valueFromGet : postParams.get(field);
        return value ?? '';
    };

    let hiddenSearchFeatures = hiddenDefaultSearchFilters;
    if (groupForMySequences !== undefined) {
        hiddenSearchFeatures = [
            ...hiddenSearchFeatures,
            { name: GROUP_FIELD, filterValue: groupForMySequences, type: 'string' as const, notSearchable: true },
        ];
    }

    const metadataFilterWithoutHiddenFilters = getMetadataFilters(
        getSearchParams,
        organism,
        groupForMySequences !== undefined
            ? {
                  exclude: [GROUP_FIELD],
              }
            : {},
    );
    const metadataFilter = addHiddenFilters(metadataFilterWithoutHiddenFilters, hiddenSearchFeatures);
    const mutationFilter = getMutationFilter(getSearchParams);

    const pageParam = getSearchParams('page');
    const page = pageParam !== '' ? Number.parseInt(pageParam, 10) : 1;
    const offset = (page - 1) * pageSize;
    const orderBy = getOrderBy(getSearchParams, schema.defaultOrderBy, schema.defaultOrder);

    const referenceGenomesSequenceNames = getReferenceGenomesSequenceNames(organism);

    const data = await getData(organism, metadataFilter, mutationFilter, offset, pageSize, orderBy);

    return {
        organism,
        cleanedOrganism,
        data,
        page,
        metadataFilter,
        metadataFilterWithoutHiddenFilters,
        mutationFilter,
        lapisUrl,
        referenceGenomesSequenceNames,
        schema,
        clientConfig,
        orderBy,
    };
}
