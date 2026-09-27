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

const PUBLIC_ROUTES = [
    /^\/$/,
    /^\/auth\/(login|callback|login-failed)\/?$/,
    /^\/(404|500|503|logout|loculus-info|api-documentation|search-index.json)\/?$/,
    /^\/(docs|about|_astro|images)(\/|$)/,
    /^\/favicon\./,
    /^\/admin\/logs\.txt$/,
];

export function isApiRoute(pathname: string): boolean {
    return (
        /^\/lapis(\/|$)/.test(pathname) ||
        /^\/seq\/[^/]+\.(fa|tsv)\/?$/.test(pathname) ||
        /^\/seq\/[^/]+\/details\.json$/.test(pathname)
    );
}

export function shouldMiddlewareEnforceLogin(pathname: string, configuredOrganisms: string[], requireLogin = false) {
    if (requireLogin && !PUBLIC_ROUTES.some((route) => route.test(pathname))) return true;
    return getEnforcedLoginRoutes(configuredOrganisms).some((route) => route.test(pathname));
}
