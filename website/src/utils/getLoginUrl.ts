import { routes } from '../routes/routes';

export const getLoginUrl = (returnTo: string, origin: string) => {
    const fallback = routes.userOverviewPage();
    let resolved: URL;
    try {
        resolved = new URL(returnTo, origin);
    } catch {
        return routes.authLogin(fallback);
    }

    if (resolved.origin !== origin) {
        return routes.authLogin(fallback);
    }

    if ([routes.logout(), routes.authLoginFailed()].includes(resolved.pathname)) {
        return routes.authLogin(fallback);
    }

    // Keep double-slash paths absolute so they cannot be reinterpreted as another host.
    const returnToPath = resolved.pathname.startsWith('//')
        ? resolved.href
        : resolved.pathname + resolved.search + resolved.hash;
    return routes.authLogin(returnToPath);
};
