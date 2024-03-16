import { bottomNavigationItems } from './bottomNavigationItems.ts';
import { routes } from './routes.ts';
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
            {
                text: 'Datasets',
                path: routes.datasetsPage(),
            },
            ...(isLoggedIn
                ? [{ text: 'My account', path: routes.userOverviewPage() }]
                : [{ text: 'Login', path: loginUrl! }]),
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
        {
            text: 'Datasets',
            path: routes.datasetsPage(),
        },
        ...(isLoggedIn
            ? [{ text: 'My account', path: routes.userOverviewPage(organism) }]
            : [{ text: 'Login', path: loginUrl! }]),
    ];
}
