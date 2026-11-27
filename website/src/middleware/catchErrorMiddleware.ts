import { defineMiddleware } from 'astro/middleware';

import { getInstanceLogger } from '../logger.ts';

const logger = getInstanceLogger('ErrorMiddleware');

export const catchErrorMiddleware = defineMiddleware(async (context, next) => {
    try {
        return await next();
    } catch (error) {
        logger.error(`Unhandled error for ${context.request.method} ${context.url.pathname}: ${String(error)}`, {
            method: context.request.method,
            path: context.url.pathname,
            organism: context.params.organism,
            stack: error instanceof Error ? error.stack : undefined,
        });
        return context.redirect('/500');
    }
});
