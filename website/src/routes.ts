import type { AccessionVersion } from './types/backend.ts';
import type { FilterValue } from './types/config.ts';
import { getAccessionVersionString } from './utils/extractAccessionVersion.ts';

export const routes = {
    aboutPage: () => '/about',
    apiDocumentationPage: () => '/api_documentation',
    governancePage: () => '/governance',
    statusPage: () => '/status',
    organismStartPage: (organism: string) => `/${organism}`,
    searchPage: <Filter extends FilterValue>(organism: string, searchFilter: Filter[] = [], page: number = 1) =>
        withOrganism(organism, `/search?${buildSearchParams(searchFilter, page).toString()}`),
    sequencesDetailsPage: (organism: string, accessionVersion: AccessionVersion | string) =>
        `/${organism}/sequences/${getAccessionVersionString(accessionVersion)}`,
    sequencesVersionsPage: (organism: string, accessionVersion: AccessionVersion | string) =>
        `/${organism}/sequences/${getAccessionVersionString(accessionVersion)}/versions`,
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
    userSequencesPage: (organism: string) => withOrganism(organism, `/user/sequences`),
    versionPage: (organism: string, accession: string) => withOrganism(organism, `/sequences/${accession}/versions`),
    unknownOrganismPage: (organism: string) => `/404?unknownOrganism=${organism}`,
    datasetsPage: (username?: string | undefined) => {
        const datasetPagePath = `/datasets` as const;
        return username === undefined ? datasetPagePath : datasetPagePath + `?user=${username}`
    },
    datasetPage: (datasetId: string, datasetVersion: string, username?: string | undefined) => {
        const datasetPagePath = `/datasets/${datasetId}?=${datasetVersion}`
        return username === undefined ? datasetPagePath : datasetPagePath + `&user=${username}`
    },
    logout: () => '/logout',
};

const buildSearchParams = <Filter extends FilterValue>(searchFilter: Filter[] = [], page: number = 1) => {
    const params = new URLSearchParams();
    searchFilter.forEach((filter) => {
        if (filter.filterValue !== '') {
            params.set(filter.name, filter.filterValue);
        }
    });
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
    ];
}

function withOrganism(organism: string, path: `/${string}`) {
    return `/${organism}${path}`;
}
