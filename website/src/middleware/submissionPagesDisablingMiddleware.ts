import { defineMiddleware } from 'astro/middleware';

export const submissionPagesDisablingMiddleware = defineMiddleware(async (context, next) => {
    const organism = context.params.organism;

    if (organism !== undefined && context.url.pathname.includes(`${organism}/submission`)) {
        return context.rewrite('/404');
    }

    return next();
});
