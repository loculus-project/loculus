import { bottomNavigationItems } from './bottomNavigationItems.ts';
import { extraTopNavigationItems } from './extraTopNavigationItems.js';
import { routes } from './routes.ts';

export const navigationItems = {
    top: topNavigationItems,
    bottom: bottomNavigationItems,
};

function getCommonItems(organism: string | undefined) {
    return [
        {
            text: 'Browse',
            path: organism ? routes.searchPage(organism) : routes.organismSelectorPage('search'),
        },
        {
            text: 'Submit',
            path: organism ? routes.submissionPageWithoutGroup(organism) : routes.organismSelectorPage('submission'),
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
              path: organism ? routes.userOverviewPage(organism) : routes.userOverviewPage(),
          }
        : {
              text: 'Login',
              path: loginUrl!,
          };
}

function topNavigationItems(organism: string | undefined, isLoggedIn: boolean, loginUrl: string | undefined) {
    const commonItems = getCommonItems(organism);
    const accountItem = getAccountItem(isLoggedIn, loginUrl, organism);

    return [...commonItems, ...extraTopNavigationItems, accountItem];
}
