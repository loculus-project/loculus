const enforcedLoginRoutesCache: Record<string, RegExp[]> = {};
const lapisDataRoutesCache: Record<string, RegExp[]> = {};

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

export function shouldMiddlewareEnforceLogin(pathname: string, configuredOrganisms: string[]) {
    return getEnforcedLoginRoutes(configuredOrganisms).some((route) => route.test(pathname));
}

/**
 * Routes that serve LAPIS data. When the deployment enables LAPIS authentication
 * (`lapis.auth.enabled` → `lapisAuthEnabled` in the runtime config), these routes require a
 * logged-in user: the user's access token is attached to every server-side LAPIS request
 * (see `services/lapisClient.ts` and the `/api/lapis` proxy).
 *
 * `/api/*` is deliberately not listed: the same-origin LAPIS proxy gates itself with a 401
 * problem detail (fetch clients must not be sent through a Keycloak login redirect).
 */
function getLapisDataRoutes(configuredOrganisms: string[]) {
    const cacheKey = configuredOrganisms.join('');
    if (!(cacheKey in lapisDataRoutesCache)) {
        const organismSpecificRoutes = configuredOrganisms.flatMap((organism) => [
            new RegExp(`^/${organism}/search`),
            new RegExp(`^/${organism}/submission/[^/]+/released`),
        ]);

        lapisDataRoutesCache[cacheKey] = [
            new RegExp('^/$'),
            new RegExp('^/seq(/|$)'),
            new RegExp('^/seqsets(/|$)'),
            new RegExp('^/group(/|$)'),
            ...organismSpecificRoutes,
        ];
    }
    return lapisDataRoutesCache[cacheKey];
}

export function isLapisDataRoute(pathname: string, configuredOrganisms: string[]) {
    return getLapisDataRoutes(configuredOrganisms).some((route) => route.test(pathname));
}
