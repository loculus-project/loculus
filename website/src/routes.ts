import type { AccessionVersion } from './types/backend.ts';
import type { AccessionFilter, FilterValue, MutationFilter } from './types/config.ts';
import type { OrderBy } from './types/lapis.ts';
import { getAccessionVersionString } from './utils/extractAccessionVersion.ts';

const approxMaxUrlLengthForSearch = 1900;
export const SEARCH = 'SEARCH';
export const MY_SEQUENCES = 'MY_SEQUENCES';

export const routes = {
    aboutPage: () => '/about',
    apiDocumentationPage: () => '/api_documentation',
    governancePage: () => '/governance',
    statusPage: () => '/status',
    organismStartPage: (organism: string) => `/${organism}`,
    mySequencesWithoutGroup: (organism: string) => `/${organism}/my_sequences`,
    searchPage: <Filter extends FilterValue>(
        organism: string,
        metadataFilter: Filter[] = [],
        accessionFilter: AccessionFilter = {},
        mutationFilter: MutationFilter = {},
        page: number | undefined = undefined,
        orderBy?: OrderBy,
    ) =>
        withOrganism(
            organism,
            `/search?${buildSearchParams(metadataFilter, accessionFilter, mutationFilter, page, orderBy).toString()}`,
        ),

    mySequencesPage: (
        organism: string,
        group: string,
        metadataFilter: FilterValue[] = [],
        accessionFilter: AccessionFilter = {},
        mutationFilter: MutationFilter = {},
        page: number | undefined = undefined,
        orderBy?: OrderBy,
    ) =>
        withOrganism(
            organism,
            `/my_sequences/${group}?${buildSearchParams(metadataFilter, accessionFilter, mutationFilter, page, orderBy).toString()}`,
        ),
    sequencesDetailsPage: (accessionVersion: AccessionVersion | string) =>
        `/seq/${getAccessionVersionString(accessionVersion)}`,
    sequencesVersionsPage: (accessionVersion: AccessionVersion | string) =>
        `/seq/${getAccessionVersionString(accessionVersion)}/versions`,
    sequencesFastaPage: (accessionVersion: AccessionVersion | string, download = false) => {
        let url = `${routes.sequencesDetailsPage(accessionVersion)}.fa`;
        if (download) {
            url += '?download';
        }
        return url;
    },
    createGroup: () => '/user/createGroup',
    submissionPage: (organism: string) => withOrganism(organism, '/submission'),
    submitPage: (organism: string) => withOrganism(organism, '/submission/submit'),
    revisePage: (organism: string) => withOrganism(organism, '/revise'),
    editPage: (organism: string, accessionVersion: AccessionVersion) =>
        withOrganism(organism, `/user/edit/${accessionVersion.accession}/${accessionVersion.version}`),
    userOverviewPage: (organism?: string | undefined) => {
        const userPagePath = `/user` as const;
        return organism === undefined ? userPagePath : withOrganism(organism, userPagePath);
    },
    groupOverviewPage: (groupName: string) => `/group/${groupName}`,
    userSequencesPage: (organism: string) => withOrganism(organism, `/user/seq`),
    userSequenceReviewPage: (organism: string) => withOrganism(organism, `/submission/review`),
    versionPage: (accession: string) => `/seq/${accession}/versions`,
    datasetsPage: (username?: string | undefined) => {
        const datasetPagePath = `/datasets` as const;
        return username === undefined ? datasetPagePath : datasetPagePath + `?user=${username}`;
    },
    datasetPage: (datasetId: string, datasetVersion: string, username?: string | undefined) => {
        const datasetPagePath = `/datasets/${datasetId}?version=${datasetVersion}`;
        return username === undefined ? datasetPagePath : datasetPagePath + `&user=${username}`;
    },
    notFoundPage: () => `/404`,
    logout: () => '/logout',
    organismSelectorPage: (redirectTo: string) => `/organism-selector/${redirectTo}`,
};

export type ClassOfSearchPageType = 'SEARCH' | 'MY_SEQUENCES';

export const navigateToSearchLikePage = (
    organism: string,
    classOfSearchPage: ClassOfSearchPageType,
    group: string | undefined,
    metadataFilter: FilterValue[] = [],
    accessionFilter: AccessionFilter = {},
    mutationFilter: MutationFilter = {},
    page?: number,
    orderBy?: OrderBy,
) => {
    const paramsString = buildSearchParams(metadataFilter, accessionFilter, mutationFilter, page, orderBy).toString();

    if (paramsString.length < approxMaxUrlLengthForSearch) {
        if (classOfSearchPage === SEARCH) {
            location.href = routes.searchPage(organism, metadataFilter, accessionFilter, mutationFilter, page, orderBy);
        }
        if (classOfSearchPage === MY_SEQUENCES) {
            location.href = routes.mySequencesPage(
                organism,
                group!,
                metadataFilter,
                accessionFilter,
                mutationFilter,
                page,
                orderBy,
            );
        }
    } else {
        const form = document.createElement('form');
        const addField = (name: string, value: string) => {
            const field = document.createElement('input');
            field.type = 'hidden';
            field.name = name;
            field.value = value;
            form.appendChild(field);
        };
        form.method = 'POST';
        form.action =
            classOfSearchPage === SEARCH ? routes.searchPage(organism) : routes.mySequencesPage(organism, group!);

        addField('searchQuery', paramsString);
        addField('organism', organism);

        document.body.appendChild(form);
        form.submit();
    }
};

const buildSearchParams = <Filter extends FilterValue>(
    metadataFilter: Filter[],
    accessionFilter: AccessionFilter,
    mutationFilter: MutationFilter,
    page?: number,
    orderBy?: OrderBy,
) => {
    const params = new URLSearchParams();
    metadataFilter.forEach((filter) => {
        if (filter.filterValue !== '') {
            params.set(filter.name, filter.filterValue);
        }
    });
    const setCommaSeparatedParamsIfNotNotEmpty = (paramName: string, value: string[] | undefined) => {
        if (value !== undefined && value.length > 0) {
            params.set(paramName, value.join(','));
        }
    };
    setCommaSeparatedParamsIfNotNotEmpty('accession', accessionFilter.accession);
    setCommaSeparatedParamsIfNotNotEmpty('nucleotideMutations', mutationFilter.nucleotideMutationQueries);
    setCommaSeparatedParamsIfNotNotEmpty('aminoAcidMutations', mutationFilter.aminoAcidMutationQueries);
    setCommaSeparatedParamsIfNotNotEmpty('nucleotideInsertions', mutationFilter.nucleotideInsertionQueries);
    setCommaSeparatedParamsIfNotNotEmpty('aminoAcidInsertions', mutationFilter.aminoAcidInsertionQueries);
    if (orderBy !== undefined) {
        params.set('orderBy', orderBy.field);
        params.set('order', orderBy.type);
    }
    if (page !== undefined) {
        params.set('page', page.toString());
    }
    return params;
};

function withOrganism(organism: string, path: `/${string}`) {
    return `/${organism}${path}`;
}
