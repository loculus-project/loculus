import type { Filter, SequenceVersion } from './types.ts';

export const routes = {
    searchPage: (searchFilter: Filter[] = [], page: number = 1) =>
        `/search?${buildSearchParams(searchFilter, page).toString()}`,
    submitPage: () => `/submit`,
    revisePage: () => `/revise`,
    reviewPage: (username: string, sequenceVersion: SequenceVersion) =>
        `/user/${username}/review/${sequenceVersion.sequenceId}/${sequenceVersion.version}`,
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
