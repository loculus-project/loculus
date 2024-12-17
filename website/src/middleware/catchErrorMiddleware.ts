import { defineMiddleware } from 'astro/middleware';

import { getInstanceLogger } from '../logger.ts';

const logger = getInstanceLogger('ErrorMiddleware');

export const catchErrorMiddleware = defineMiddleware(async (context, next) => {
    try {
        return await next();
    } catch (error) {
        logger.error(`Error for path (${context.url.pathname}): ${error}`);
        return context.redirect('/500');
    }
});
