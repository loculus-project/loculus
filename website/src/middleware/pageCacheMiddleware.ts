import { defineMiddleware } from 'astro/middleware';

import { getPageCache } from '../services/lapisCache/websiteCache.ts';

/**
 * Serves and fills the full-page cache for pages that set `Astro.locals.pageCacheOrganism`. Runs before the auth
 * middleware: requests with auth cookies or an Authorization header bypass it (see `PageCache.handle`).
 */
export const pageCacheMiddleware = defineMiddleware((context, next) => {
    const cache = getPageCache();
    if (cache === undefined) {
        return next();
    }
    return cache.handle(
        { method: context.request.method, url: context.url, headers: context.request.headers },
        async () => {
            const response = await next();
            return {
                response,
                organism: context.locals.pageCacheOrganism,
                setsCookies: [...context.cookies.headers()].length > 0,
            };
        },
    );
});
