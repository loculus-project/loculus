import type { AccessionVersion } from './types/backend.ts';
import type { Filter } from './types/config.ts';

export const navigationItems = {
    top: topNavigationItems,
    bottom: [
        {
            text: 'About',
            path: '/about',
        },
        {
            text: 'Api documentation',
            path: '/api_documentation',
        },
        {
            text: 'Governance',
            path: '/governance',
        },
        {
            text: 'Status',
            path: '/status',
        },
    ],
};

function topNavigationItems(organism: string | undefined) {
    if (organism === undefined) {
        return [
            {
                text: 'User',
                path: '/user',
            },
        ];
    }

    return [
        {
            text: 'Search',
            path: withOrganism(organism, '/search'),
        },
        {
            text: 'Submit',
            path: withOrganism(organism, '/submit'),
        },
        {
            text: 'Revise',
            path: withOrganism(organism, '/revise'),
        },
        {
            text: 'User',
            path: withOrganism(organism, '/user'),
        },
    ];
}

function withOrganism(organism: string, path: `/${string}`) {
    return `/${organism}${path}`;
}

export const routes = {
    searchPage: (organism: string, searchFilter: Filter[] = [], page: number = 1) =>
        withOrganism(organism, `/search?${buildSearchParams(searchFilter, page).toString()}`),
    sequencesDetailsPage: (organism: string, accessionVersion: string) => `/${organism}/sequences/${accessionVersion}`,
    submitPage: (organism: string) => withOrganism(organism, '/submit'),
    revisePage: (organism: string) => withOrganism(organism, '/revise'),
    reviewPage: (organism: string, username: string, accessionVersion: AccessionVersion) =>
        withOrganism(organism, `/user/${username}/review/${accessionVersion.accession}/${accessionVersion.version}`),
    userPage: (organism: string | undefined, username: string) => {
        const userPagePath = `/user/${username}` as const;
        return organism === undefined ? userPagePath : withOrganism(organism, userPagePath);
    },
    userSequencesPage: (organism: string, username: string) => withOrganism(organism, `/user/${username}/sequences`),
    versionPage: (organism: string, accession: string) => withOrganism(organism, `/sequences/${accession}/versions`),
};

const buildSearchParams = (searchFilter: Filter[] = [], page: number = 1) => {
    const params = new URLSearchParams();
    searchFilter.forEach((filter) => {
        if (filter.filterValue !== '') params.set(filter.name, filter.filterValue);
    });
    params.set('page', page.toString());
    return params;
};
