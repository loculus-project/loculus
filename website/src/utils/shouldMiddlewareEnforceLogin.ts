const enforcedLoginRoutesCache: Record<string, RegExp[]> = {};

function getEnforcedLoginRoutes(configuredOrganisms: string[]) {
    const cacheKey = configuredOrganisms.join('');
    if (!(cacheKey in enforcedLoginRoutesCache)) {
        const organismSpecificRoutes = configuredOrganisms.flatMap((organism) => [
            new RegExp(`^/${organism}/user`),
            new RegExp(`^/${organism}/my_sequences`),
        ]);

        enforcedLoginRoutesCache[cacheKey] = [new RegExp('^/user/?'), ...organismSpecificRoutes];
    }
    return enforcedLoginRoutesCache[cacheKey];
}

/**
 * Routes that stay reachable without a session on instances configured with `requireLogin`.
 *
 * They hold no instance data: either they are needed to get logged in and to report errors, or
 * they are generic documentation. Everything else is gated, including the pages that render
 * sequence data server side - those read LAPIS directly and would otherwise serve data to
 * anonymous visitors even with LAPIS taken off the internet.
 *
 * This list is the whole access policy of a `requireLogin` instance; change it here.
 */
const ROUTES_THAT_STAY_PUBLIC = [
    /^\/(404|500|503)\/?$/,
    /^\/logout\/?$/,
    // Where the client side logger posts to, so that errors from logged out visitors still arrive.
    /^\/admin\/logs\.txt$/,
    // Instance metadata that the CLI bootstraps from. Configuration, not data.
    /^\/loculus-info\/?$/,
    /^\/api-documentation\/?$/,
    /^\/docs(\/|$)/,
    /^\/about(\/|$)/,
    // Static assets are served ahead of the middleware by the node adapter, so these should never
    // be consulted. They are here so that a logged out error page keeps its styling if they are.
    /^\/_astro(\/|$)/,
    /^\/images(\/|$)/,
    /^\/favicon\./,
];

/**
 * Routes that are fetched by code rather than opened in a browser tab. When one of them needs a
 * session and there is none, 401 is more useful than a redirect to Keycloak, which would hand
 * the caller an HTML login page under a `.fa` or `.json` file name.
 */
const API_ROUTES = [
    /^\/lapis(\/|$)/,
    /^\/seq\/[^/]+\.(fa|tsv)\/?$/,
    /^\/seq\/[^/]+\/details\.json$/,
];

export function shouldMiddlewareEnforceLogin(
    pathname: string,
    configuredOrganisms: string[],
    requireLogin: boolean = false,
) {
    if (requireLogin && !ROUTES_THAT_STAY_PUBLIC.some((route) => route.test(pathname))) {
        return true;
    }
    return getEnforcedLoginRoutes(configuredOrganisms).some((route) => route.test(pathname));
}

export function isApiRoute(pathname: string) {
    return API_ROUTES.some((route) => route.test(pathname));
}
