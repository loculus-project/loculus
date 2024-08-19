import { bottomNavigationItems } from './bottomNavigationItems.ts';
import { extraTopNavigationItems } from './extraTopNavigationItems.js';
import { routes } from './routes.ts';

export const navigationItems = {
    top: topNavigationItems,
    bottom: bottomNavigationItems,
};

function getSequenceRelatedItems(organism: string | undefined) {
    return [
        {
            text: 'Browse',
            path: organism !== undefined ? routes.searchPage(organism) : routes.organismSelectorPage('search'),
        },
        {
            text: 'Submit',
            path: organism !== undefined ? routes.submissionPageWithoutGroup(organism) : routes.organismSelectorPage('submission'),
        },
        {
            text: 'SeqSets',
            path: routes.seqSetsPage(),
        },
    ];
}

function getAccountItem(isLoggedIn: boolean, loginUrl: string | undefined, organism: string | undefined) {
    return isLoggedIn
        ? {
              text: 'My account',
              path: organism !== undefined ? routes.userOverviewPage(organism) : routes.userOverviewPage(),
          }
        : {
              text: 'Login',
              path: loginUrl!,
          };
}

function topNavigationItems(organism: string | undefined, isLoggedIn: boolean, loginUrl: string | undefined) {
    const sequenceRelatedItems = getSequenceRelatedItems(organism);
    const accountItem = getAccountItem(isLoggedIn, loginUrl, organism);

    return [...sequenceRelatedItems, ...extraTopNavigationItems, accountItem];
}
