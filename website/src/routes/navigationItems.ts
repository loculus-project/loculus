import { bottomNavigationItems } from './bottomNavigationItems.ts';
import { extraTopNavigationItems } from './extraTopNavigationItems.js';
import { routes } from './routes.ts';
import { getWebsiteConfig } from '../config.ts';

export const navigationItems = {
    top: topNavigationItems,
    bottom: bottomNavigationItems,
};

export type TopNavigationItems = ReturnType<(typeof navigationItems)['top']>;

function getSequenceRelatedItems(organism: string | undefined) {
    const browseItem = {
        text: 'Browse',
        path: organism !== undefined ? routes.searchPage(organism) : routes.organismSelectorPage('search'),
    };

    if (!getWebsiteConfig().enableSubmissionNavigationItem) {
        return [browseItem];
    }

    const submitItem = {
        text: 'Submit',
        path:
            organism !== undefined
                ? routes.submissionPageWithoutGroup(organism)
                : routes.organismSelectorPage('submission'),
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
    const sequenceRelatedItems = getSequenceRelatedItems(organism);
    const seqSetsItems = getSeqSetsItems();
    const accountItems = getAccountItems(isLoggedIn, loginUrl, organism);

    return [...sequenceRelatedItems, ...seqSetsItems, ...extraTopNavigationItems, ...accountItems];
}
