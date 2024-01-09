const publicRoutesCache: Record<string, RegExp[]> = {};

function getPublicRoutes(configuredOrganisms: string[]) {
    const cacheKey = configuredOrganisms.join('');
    if (!(cacheKey in publicRoutesCache)) {
        const organismSpecificRoutes = configuredOrganisms.flatMap((organism) => [
            new RegExp(`^/${organism}/sequences(?:/.*)?$`),
            new RegExp(`^/${organism}/search$`),
            new RegExp(`^/${organism}/?$`),
        ]);

        publicRoutesCache[cacheKey] = [
            new RegExp('^/?$'),
            new RegExp('^/404$'),
            new RegExp('^/500$'),
            new RegExp('^/about$'),
            new RegExp('^/api_documentation$'),
            new RegExp('^/governance$'),
            new RegExp('^/status$'),
            new RegExp('^/logout$'),
            new RegExp('^/admin/logs.txt$'),
            ...organismSpecificRoutes,
        ];
    }
    return publicRoutesCache[cacheKey];
}

export function isPublicRoute(pathname: string, configuredOrganisms: string[]) {
    return getPublicRoutes(configuredOrganisms).some((route) => route.test(pathname));
}
