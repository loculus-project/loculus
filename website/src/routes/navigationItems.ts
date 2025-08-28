import type { SVGProps, ForwardRefExoticComponent } from 'react';

import { bottomNavigationItems } from './bottomNavigationItems.ts';
import { extraStaticTopNavigationItems } from './extraTopNavigationItems.js';
import { routes } from './routes.ts';
import { getWebsiteConfig } from '../config.ts';
import Upload from '~icons/icon-park-outline/upload';
import ListSearch from '~icons/tabler/list-search';

export const navigationItems = {
    top: topNavigationItems,
    bottom: bottomNavigationItems,
};

export type NavigationItemIcon = ForwardRefExoticComponent<SVGProps<SVGSVGElement>>;

export type NavigationItem = {
    text: string;
    path: string;
    icon?: NavigationItemIcon;
};

export type TopNavigationItems = NavigationItem[];

export function getSequenceRelatedItems(organism: string | undefined) {
    if (organism === undefined) {
        return [];
    }

    const browseItem: NavigationItem = {
        text: 'Browse data',
        path: routes.searchPage(organism),
        icon: ListSearch,
    };

    if (!getWebsiteConfig().enableSubmissionNavigationItem) {
        return [browseItem];
    }

    const submitItem: NavigationItem = {
        text: 'Submit sequences',
        path: routes.submissionPageWithoutGroup(organism),
        icon: Upload,
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
