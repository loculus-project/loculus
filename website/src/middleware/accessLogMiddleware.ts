import { defineMiddleware } from 'astro/middleware';

import { getInstanceLogger } from '../logger.ts';

const logger = getInstanceLogger('AccessLog');

/**
 * Writes one log line per incoming request with method, path, status, duration, organism and login state.
 * Must be the outermost middleware so it sees the final response, including the redirect from catchErrorMiddleware.
 * Kubernetes liveness/readiness probes are logged at debug so they don't flood the info log.
 */
export const accessLogMiddleware = defineMiddleware(async (context, next) => {
    const start = performance.now();
    let status: number | undefined;
    try {
        const response = await next();
        status = response.status;
        return response;
    } finally {
        const session = context.locals.session;
        const isProbe = context.request.headers.get('user-agent')?.startsWith('kube-probe/') ?? false;
        const metadata = {
            method: context.request.method,
            path: context.url.pathname,
            status: status ?? 500,
            durationMs: Math.round(performance.now() - start),
            organism: context.params.organism,
            loggedIn: session?.isLoggedIn ?? false,
            user: session?.user?.username,
        };
        const message = `${metadata.method} ${metadata.path} ${metadata.status}`;
        if (isProbe) {
            logger.debug(message, metadata);
        } else {
            logger.info(message, metadata);
        }
    }
});
