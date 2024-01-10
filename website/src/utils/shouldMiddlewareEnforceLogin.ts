const enforcedLoginRoutesCache: Record<string, RegExp[]> = {};

function getEnforcedLoginRoutes(configuredOrganisms: string[]) {
    const cacheKey = configuredOrganisms.join('');
    if (!(cacheKey in enforcedLoginRoutesCache)) {
        const organismSpecificRoutes = configuredOrganisms.flatMap((organism) => [
            new RegExp(`^/${organism}/revise`),
            new RegExp(`^/${organism}/submit`),
        ]);

        enforcedLoginRoutesCache[cacheKey] = [new RegExp('^/user/'), ...organismSpecificRoutes];
    }
    return enforcedLoginRoutesCache[cacheKey];
}

export function shouldMiddlewareEnforceLogin(pathname: string, configuredOrganisms: string[]) {
    return getEnforcedLoginRoutes(configuredOrganisms).some((route) => route.test(pathname));
}
