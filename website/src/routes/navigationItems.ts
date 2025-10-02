import type { ComponentType } from 'react';

import { bottomNavigationItems } from './bottomNavigationItems.ts';
import { extraStaticTopNavigationItems } from './extraTopNavigationItems.js';
import { routes } from './routes.ts';
import { getWebsiteConfig } from '../config.ts';
import UploadIcon from '~icons/material-symbols/upload';
import SearchIcon from '~icons/tabler/list-search';

export const navigationItems = {
    top: topNavigationItems,
    bottom: bottomNavigationItems,
};

type NavigationIcon = ComponentType<{ className?: string }>;

export type TopNavigationItem = {
    text: string;
    path: string;
    id?: string;
    icon?: NavigationIcon;
};

export type TopNavigationItems = TopNavigationItem[];

export function getSequenceRelatedItems(organism: string | undefined) {
    if (organism === undefined) {
        return [];
    }

    const browseItem = {
        text: 'Browse data',
        path: routes.searchPage(organism),
        icon: SearchIcon,
    };

    if (!getWebsiteConfig().enableSubmissionNavigationItem) {
        return [browseItem];
    }

    const submitItem = {
        text: 'Submit sequences',
        path: routes.submissionPageWithoutGroup(organism),
        icon: UploadIcon,
    };
    return [browseItem, submitItem];
}

function getSeqSetsItems() {
    if (!getWebsiteConfig().enableSeqSets) {
        return [];
    }

    return [
        {
            id: 'seqsets',
            text: 'SeqSets',
            path: routes.seqSetsPage(),
        },
    ];
}

function getAccountItems(isLoggedIn: boolean, loginUrl: string) {
    if (!getWebsiteConfig().enableLoginNavigationItem) {
        return [];
    }

    const accountItem = isLoggedIn
        ? {
              id: 'account',
              text: 'My account',
              path: routes.userOverviewPage(),
          }
        : {
              id: 'login',
              text: 'Login',
              path: loginUrl,
          };
    return [accountItem];
}

function topNavigationItems(isLoggedIn: boolean, loginUrl: string) {
    const seqSetsItems = getSeqSetsItems();
    const accountItems = getAccountItems(isLoggedIn, loginUrl);

    return [...seqSetsItems, ...extraStaticTopNavigationItems, ...accountItems];
}
