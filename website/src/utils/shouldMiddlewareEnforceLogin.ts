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
 * The homepage (`/`) is deliberately not listed: it stays publicly accessible even when
 * LAPIS authentication is enabled; its per-organism sequence counts (LAPIS data) are
 * hidden for anonymous visitors instead (see `IndexPage/getOrganismStatistics.ts`).
 *
 * `/api/*` is deliberately not listed: the same-origin LAPIS proxy gates itself with a 401
 * problem detail (fetch clients must not be sent through a Keycloak login redirect).
 *
 * `/seq/<accessionVersion>/<fileCategory>/<fileName>` is deliberately not enforced either:
 * those endpoints serve sequence files, are fetched by browsers and tools cross-origin
 * (the backend advertises absolute URLs), and a Keycloak login redirect would surface as
 * an opaque CORS error instead of an authentication failure. They self-gate: the file
 * proxy forwards the caller's session token, and the backend rejects unauthenticated
 * requests with a 401 that carries CORS headers.
 */
function getLapisDataRoutes(configuredOrganisms: string[]) {
    const cacheKey = configuredOrganisms.join('');
    if (!(cacheKey in lapisDataRoutesCache)) {
        const organismSpecificRoutes = configuredOrganisms.flatMap((organism) => [
            new RegExp(`^/${organism}/search`),
            new RegExp(`^/${organism}/submission/[^/]+/released`),
        ]);

        lapisDataRoutesCache[cacheKey] = [
            new RegExp('^/seq(/|$)'),
            new RegExp('^/seqsets(/|$)'),
            new RegExp('^/group(/|$)'),
            ...organismSpecificRoutes,
        ];
    }
    return lapisDataRoutesCache[cacheKey];
}

export function isLapisDataRoute(pathname: string, configuredOrganisms: string[]) {
    // File-proxy endpoints (three segments after /seq) self-gate and must not be
    // redirected to the Keycloak login page (see comment above).
    if (/^\/seq\/[^/]+\/[^/]+\/[^/]+$/.test(pathname)) {
        return false;
    }
    return getLapisDataRoutes(configuredOrganisms).some((route) => route.test(pathname));
}
