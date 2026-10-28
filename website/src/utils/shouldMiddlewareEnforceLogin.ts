type LoginRoutes = {
    always: RegExp[];
    // Pages that show released data. They require a login when the instance sets `auth.requireAuthenticationForData`.
    data: RegExp[];
};

const loginRoutesCache: Record<string, LoginRoutes> = {};

// File links (`/seq/<accessionVersion>/<fileCategory>/<fileName>`) are also fetched by API clients and by the browser
// via JavaScript, where a redirect to the login page does not help. The route answers with the backend's 401 instead.
const fileLinkRoute = /^\/seq\/[^/]+\/[^/]+\/[^/]+$/;

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
    { requireAuthenticationForData }: { requireAuthenticationForData: boolean },
) {
    const { always, data } = getLoginRoutes(configuredOrganisms);
    if (always.some((route) => route.test(pathname))) {
        return true;
    }
    return requireAuthenticationForData && !fileLinkRoute.test(pathname) && data.some((route) => route.test(pathname));
}
