import { defineMiddleware } from 'astro/middleware';

import { loginIsRequired } from '../config';

export const restrictedCacheMiddleware = defineMiddleware(async (_context, next) => {
    const response = await next();
    if (!loginIsRequired()) return response;
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    headers.append('Vary', 'Cookie, Authorization');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
