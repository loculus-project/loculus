import { bottomNavigationItems } from './bottomNavigationItems.js';
export const navigationItems = {
    top: topNavigationItems,
    bottom: bottomNavigationItems,
};

function topNavigationItems(organism: string | undefined, isLoggedIn: boolean, loginUrl: string | undefined) {
    if (organism === undefined) {
        return [
            {
                text: 'Browse',
                path: routes.organismSelectorPage('search'),
            },
            {
                text: 'Submit',
                path: routes.organismSelectorPage('submit'),
            },
            ...(isLoggedIn
                ? [{ text: 'My account', path: routes.userOverviewPage() }]
                : [{ text: 'Login', path: loginUrl! }]),
            {
                text: 'Datasets',
                path: routes.datasetsPage(),
            },
        ];
    }

    return [
        {
            text: 'Browse',
            path: routes.searchPage(organism),
        },
        {
            text: 'Submit',
            path: routes.submissionPage(organism),
        },
        ...(isLoggedIn
            ? [{ text: 'My account', path: routes.userOverviewPage(organism) }]
            : [{ text: 'Login', path: loginUrl! }]),
        {
            text: 'Datasets',
            path: routes.datasetsPage(),
        },
    ];
}