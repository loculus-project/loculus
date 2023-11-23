import type { AccessionVersion } from './types/backend.ts';
import type { Filter } from './types/config.ts';

export const navigationItems = {
    top: [
        {
            text: 'Search',
            path: '/search',
        },
        {
            text: 'Submit',
            path: '/submit',
        },
        {
            text: 'Revise',
            path: '/revise',
        },
        {
            text: 'User',
            path: '/user',
        },
    ],
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

export const routes = {
    searchPage: (searchFilter: Filter[] = [], page: number = 1) =>
        `/search?${buildSearchParams(searchFilter, page).toString()}`,
    submitPage: () => `/submit`,
    revisePage: () => `/revise`,
    reviewPage: (username: string, accessionVersion: AccessionVersion) =>
        `/user/${username}/review/${accessionVersion.accession}/${accessionVersion.version}`,
    userPage: (username: string) => `/user/${username}`,
    userSequencesPage: (username: string) => `/user/${username}/sequences`,
    versionPage: (accession: string) => `/sequences/${accession}/versions`,
};

const buildSearchParams = (searchFilter: Filter[] = [], page: number = 1) => {
    const params = new URLSearchParams();
    searchFilter.forEach((filter) => {
        if (filter.filterValue !== '') params.set(filter.name, filter.filterValue);
    });
    params.set('page', page.toString());
    return params;
};
