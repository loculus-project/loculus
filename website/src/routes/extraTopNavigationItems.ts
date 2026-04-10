// The following code is in a separate file so that it can be overwritten by Pathoplexus.
import type { TopNavigationItems } from './navigationItems.ts';

export const extraStaticTopNavigationItems: TopNavigationItems = [
    {
        text: 'Docs',
        path: '/docs/',
    },
];

export const extraSequenceRelatedTopNavigationItems = (_: string | undefined): TopNavigationItems => {
    return [];
};
