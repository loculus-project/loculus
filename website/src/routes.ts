import type { AccessionVersion } from './types/backend.ts';
import type { FilterValue, MutationFilter } from './types/config.ts';
import type { OrderBy } from './types/lapis.ts';
import { getAccessionVersionString } from './utils/extractAccessionVersion.ts';

export const routes = {
    aboutPage: () => '/about',
    apiDocumentationPage: () => '/api_documentation',
    governancePage: () => '/governance',
    statusPage: () => '/status',
    organismStartPage: (organism: string) => `/${organism}`,
    searchPage: <Filter extends FilterValue>(
        organism: string,
        metadataFilter: Filter[] = [],
        mutationFilter: MutationFilter = {},
        page: number = 1,
        orderBy?: OrderBy,
    ) =>
        withOrganism(
            organism,
            `/search?${buildSearchParams(metadataFilter, mutationFilter, page, orderBy).toString()}`,
        ),
    sequencesDetailsPage: (organism: string, accessionVersion: AccessionVersion | string) =>
        `/${organism}/seq/${getAccessionVersionString(accessionVersion)}`,
    sequencesVersionsPage: (organism: string, accessionVersion: AccessionVersion | string) =>
        `/${organism}/seq/${getAccessionVersionString(accessionVersion)}/versions`,
    sequencesFastaPage: (organism: string, accessionVersion: AccessionVersion | string, download = false) => {
        let url = `${routes.sequencesDetailsPage(organism, accessionVersion)}.fa`;
        if (download) {
            url += '?download';
        }
        return url;
    },
    submitPage: (organism: string) => withOrganism(organism, '/submit'),
    revisePage: (organism: string) => withOrganism(organism, '/revise'),
    editPage: (organism: string, accessionVersion: AccessionVersion) =>
        withOrganism(organism, `/user/edit/${accessionVersion.accession}/${accessionVersion.version}`),
    userOverviewPage: (organism?: string | undefined) => {
        const userPagePath = `/user` as const;
        return organism === undefined ? userPagePath : withOrganism(organism, userPagePath);
    },
    groupOverviewPage: (groupName: string) => {
        const groupPagePath = `/group/${groupName}` as const;
        return groupPagePath;
    },
    userSequencesPage: (organism: string) => withOrganism(organism, `/user/seq`),
    versionPage: (organism: string, accession: string) => withOrganism(organism, `/seq/${accession}/versions`),
    datasetsPage: (username?: string | undefined) => {
        const datasetPagePath = `/datasets` as const;
        return username === undefined ? datasetPagePath : datasetPagePath + `?user=${username}`;
    },
    datasetPage: (datasetId: string, datasetVersion: string, username?: string | undefined) => {
        const datasetPagePath = `/datasets/${datasetId}?=${datasetVersion}`;
        return username === undefined ? datasetPagePath : datasetPagePath + `&user=${username}`;
    },
    notFoundPage: () => `/404`,
    logout: () => '/logout',
};

const buildSearchParams = <Filter extends FilterValue>(
    metadataFilter: Filter[],
    mutationFilter: MutationFilter,
    page: number,
    orderBy?: OrderBy,
) => {
    const params = new URLSearchParams();
    metadataFilter.forEach((filter) => {
        if (filter.filterValue !== '') {
            params.set(filter.name, filter.filterValue);
        }
    });
    if (mutationFilter.nucleotideMutationQueries !== undefined && mutationFilter.nucleotideMutationQueries.length > 0) {
        params.set('nucleotideMutations', mutationFilter.nucleotideMutationQueries.join(','));
    }
    if (mutationFilter.aminoAcidMutationQueries !== undefined && mutationFilter.aminoAcidMutationQueries.length > 0) {
        params.set('aminoAcidMutations', mutationFilter.aminoAcidMutationQueries.join(','));
    }
    if (
        mutationFilter.nucleotideInsertionQueries !== undefined &&
        mutationFilter.nucleotideInsertionQueries.length > 0
    ) {
        params.set('nucleotideInsertions', mutationFilter.nucleotideInsertionQueries.join(','));
    }
    if (mutationFilter.aminoAcidInsertionQueries !== undefined && mutationFilter.aminoAcidInsertionQueries.length > 0) {
        params.set('aminoAcidInsertions', mutationFilter.aminoAcidInsertionQueries.join(','));
    }
    if (orderBy !== undefined) {
        params.set('orderBy', orderBy.field);
        params.set('order', orderBy.type);
    }
    params.set('page', page.toString());
    return params;
};

export const navigationItems = {
    top: topNavigationItems,
    bottom: [
        {
            text: 'About',
            path: routes.aboutPage(),
        },
        {
            text: 'Api documentation',
            path: routes.apiDocumentationPage(),
        },
        {
            text: 'Governance',
            path: routes.governancePage(),
        },
        {
            text: 'Status',
            path: routes.statusPage(),
        },
    ],
};

function topNavigationItems(organism: string | undefined) {
    if (organism === undefined) {
        return [
            {
                text: 'User',
                path: routes.userOverviewPage(),
            },
            {
                text: 'Datasets',
                path: routes.datasetsPage(),
            },
        ];
    }

    return [
        {
            text: 'Search',
            path: routes.searchPage(organism),
        },
        {
            text: 'Submit',
            path: routes.submitPage(organism),
        },
        {
            text: 'Revise',
            path: routes.revisePage(organism),
        },
        {
            text: 'User',
            path: routes.userOverviewPage(organism),
        },
        {
            text: 'Datasets',
            path: routes.datasetsPage(),
        },
    ];
}

function withOrganism(organism: string, path: `/${string}`) {
    return `/${organism}${path}`;
}
