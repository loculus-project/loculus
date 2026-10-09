import type { APIRoute } from 'astro';

import { getInstanceLogger } from '../../logger.ts';
import { routes } from '../../routes/routes.ts';

const logger = getInstanceLogger('AuthCallback');

// Successful callbacks are consumed by authMiddleware before this route runs.
// A rejected callback can still arrive with an independently validated session,
// for example when Back revisits a completed authorization request.
export const GET: APIRoute = (context) => {
    if (context.locals.session?.isLoggedIn === true) {
        logger.info('OIDC callback ignored: reason=already_authenticated');
        return context.redirect(routes.userOverviewPage());
    }
    return context.redirect(routes.authLoginFailed());
};
