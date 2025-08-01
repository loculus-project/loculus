// The following code is in a separate file so that it can be overwritten by Pathoplexus.
import type { TopNavigationItems } from './navigationItems.ts';

export const extraStaticTopNavigationItems = [];

export const extraSequenceRelatedTopNavigationItems = (_: string | undefined): TopNavigationItems => {
    return [];
};
