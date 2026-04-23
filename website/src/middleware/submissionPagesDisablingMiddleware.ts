import { defineMiddleware } from 'astro/middleware';

import { getWebsiteConfig } from '../config.ts';

export const submissionPagesDisablingMiddleware = defineMiddleware(async (context, next) => {
    const organism = context.params.organism;

    if (organism !== undefined && context.url.pathname.includes(`${organism}/submission`)) {
        if (getWebsiteConfig().readOnlyMode) {
            return context.rewrite('/503?service=readonly');
        }
        return context.rewrite('/404');
    }

    return next();
});
