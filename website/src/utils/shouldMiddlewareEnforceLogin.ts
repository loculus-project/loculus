const enforcedLoginRoutesCache: Record<string, RegExp[]> = {};

function getEnforcedLoginRoutes(configuredOrganisms: string[]) {
    const cacheKey = configuredOrganisms.join('');
    if (!(cacheKey in enforcedLoginRoutesCache)) {
        const organismSpecificRoutes = configuredOrganisms.flatMap((organism) => [
            new RegExp(`^/${organism}/user`),
            new RegExp(`^/${organism}/my_sequences`),
        ]);

        enforcedLoginRoutesCache[cacheKey] = [
            new RegExp('^/user/?'),
            new RegExp(`^/datasets\/?$`),
            ...organismSpecificRoutes,
        ];
    }
    return enforcedLoginRoutesCache[cacheKey];
}

export function shouldMiddlewareEnforceLogin(pathname: string, configuredOrganisms: string[]) {
    return getEnforcedLoginRoutes(configuredOrganisms).some((route) => route.test(pathname));
}
