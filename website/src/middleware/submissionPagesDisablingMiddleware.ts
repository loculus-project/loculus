import { defineMiddleware } from 'astro/middleware';

import { getWebsiteConfig } from '../config.ts';

export const submissionPagesDisablingMiddleware = defineMiddleware(async (context, next) => {
    const config = getWebsiteConfig();
    const submissionsRoutedHere =
        context.params.organism !== undefined && context.url.pathname.includes(`${context.params.organism}/submission`);

    if (!submissionsRoutedHere) {
        return next();
    }

    if (config.readOnlyMode) {
        return context.rewrite('/503?service=readonly');
    }
    if (!config.enableSubmissionPages) {
        return context.rewrite('/404');
    }
    return next();
});
