import { bottomNavigationItems } from './bottomNavigationItems.ts';
import { extraStaticTopNavigationItems } from './extraTopNavigationItems.js';
import { routes } from './routes.ts';
import { getWebsiteConfig } from '../config.ts';

export const navigationItems = {
    top: topNavigationItems,
    bottom: bottomNavigationItems,
};

export type TopNavigationItems = {
    text: string;
    path: string;
}[];

export function getSequenceRelatedItems(organism: string | undefined) {
    if (organism === undefined) {
        return [];
    }

    const browseItem = {
        text: 'Browse',
        path: routes.searchPage(organism),
    };

    if (!getWebsiteConfig().enableSubmissionNavigationItem) {
        return [browseItem];
    }

    const submitItem = {
        text: 'Submit',
        path: routes.submissionPageWithoutGroup(organism),
    };
    return [browseItem, submitItem];
}

function getSeqSetsItems() {
    if (!getWebsiteConfig().enableSeqSets) {
        return [];
    }

    return [
        {
            text: 'SeqSets',
            path: routes.seqSetsPage(),
        },
    ];
}

function getAccountItems(isLoggedIn: boolean, loginUrl: string, organism: string | undefined) {
    if (!getWebsiteConfig().enableLoginNavigationItem) {
        return [];
    }

    const accountItem = isLoggedIn
        ? {
              text: 'My account',
              path: organism !== undefined ? routes.userOverviewPage(organism) : routes.userOverviewPage(),
          }
        : {
              text: 'Login',
              path: loginUrl,
          };
    return [accountItem];
}

function topNavigationItems(organism: string | undefined, isLoggedIn: boolean, loginUrl: string) {
    const seqSetsItems = getSeqSetsItems();
    const accountItems = getAccountItems(isLoggedIn, loginUrl, organism);

    return [...seqSetsItems, ...extraStaticTopNavigationItems, ...accountItems];
}
