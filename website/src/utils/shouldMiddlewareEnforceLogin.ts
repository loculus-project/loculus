type LoginRoutes = {
    always: RegExp[];
    // Pages that show released data. They require a login when the instance sets `auth.requireAuthenticationForData`.
    data: RegExp[];
};

const loginRoutesCache: Record<string, LoginRoutes> = {};

// File links (`/seq/<accessionVersion>/<fileCategory>/<fileName>`) are also fetched by API clients and by the browser
// via JavaScript, where a redirect to the login page does not help. The route answers with the backend's 401 instead.
const fileLinkRoute = /^\/seq\/[^/]+\/[^/]+\/[^/]+$/;

// Per-sequence downloads. Browsers are redirected to the login page, but a request with a Bearer token is let through,
// and the route forwards the token to LAPIS and the backend.
const tokenForwardingRoutes = [fileLinkRoute, /^\/seq\/[^/]+\.(fa|tsv)$/, /^\/seq\/[^/]+\/details\.json$/];

function getLoginRoutes(configuredOrganisms: string[]) {
    const cacheKey = configuredOrganisms.join('');
    if (!(cacheKey in loginRoutesCache)) {
        loginRoutesCache[cacheKey] = {
            always: [
                new RegExp('^/user/?'),
                ...configuredOrganisms.flatMap((organism) => [
                    new RegExp(`^/${organism}/user`),
                    new RegExp(`^/${organism}/my_sequences`),
                ]),
            ],
            data: [
                new RegExp('^/seq(/|$)'),
                new RegExp('^/seqsets(/|$)'),
                new RegExp('^/group(/|$)'),
                ...configuredOrganisms.flatMap((organism) => [
                    new RegExp(`^/${organism}/search`),
                    new RegExp(`^/${organism}/submission/[^/]+/released`),
                ]),
            ],
        };
    }
    return loginRoutesCache[cacheKey];
}

export function shouldMiddlewareEnforceLogin(
    pathname: string,
    configuredOrganisms: string[],
    {
        requireAuthenticationForData,
        hasBearerToken,
    }: { requireAuthenticationForData: boolean; hasBearerToken: boolean },
) {
    const { always, data } = getLoginRoutes(configuredOrganisms);
    if (always.some((route) => route.test(pathname))) {
        return true;
    }
    if (!requireAuthenticationForData || !data.some((route) => route.test(pathname))) {
        return false;
    }
    if (fileLinkRoute.test(pathname)) {
        return false;
    }
    return !(hasBearerToken && tokenForwardingRoutes.some((route) => route.test(pathname)));
}
