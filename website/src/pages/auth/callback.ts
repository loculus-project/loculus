import type { APIRoute } from 'astro';

import { routes } from '../../routes/routes.ts';

// Successful callbacks are consumed by authMiddleware before this route runs.
// Reaching the handler means the callback was missing, expired, or invalid.
export const GET: APIRoute = (context) => {
    return context.redirect(routes.authLoginFailed());
};
