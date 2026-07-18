import type { AstroCookies } from 'astro';
import { generators } from 'openid-client';

import { KeycloakClientManager } from './KeycloakClientManager';
import { setAuthRequestCookies } from './authRequestCookies.ts';
import { realmPath } from './realmPath.ts';
import { routes } from '../routes/routes';

interface AuthUrlContext {
    cookies: AstroCookies;
    locals: App.Locals;
}

export const getAuthUrl = async (redirectUrl: string, context: AuthUrlContext) => {
    const logout = routes.logout();
    if (redirectUrl.endsWith(logout)) {
        redirectUrl = redirectUrl.replace(logout, routes.userOverviewPage());
    }

    // Several components can render a login link on the same page/request (e.g. the nav bar
    // and a "you need to log in" prompt). Reuse the same state/nonce for all of them so that
    // whichever link the user actually clicks matches the cookie set for this request.
    const cached = context.locals.authRequest;
    if (cached?.redirectUrl === redirectUrl) {
        return cached.url;
    }

    // Beware: relative url does not work with Redirect.response()
    const client = await KeycloakClientManager.getClient();
    if (client === undefined) {
        return `/503?service=Authentication`;
    }

    const state = generators.state();
    const nonce = generators.nonce();
    setAuthRequestCookies(context.cookies, state, nonce);

    /* eslint-disable @typescript-eslint/naming-convention */
    const url = client.authorizationUrl({
        redirect_uri: redirectUrl,
        scope: 'openid',
        response_type: 'code',
        state,
        nonce,
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    context.locals.authRequest = { redirectUrl, url };
    return url;
};

export const getAuthBaseUrl = async () => {
    const client = await KeycloakClientManager.getClient();
    if (client === undefined) {
        return null;
    }
    const issuer = client.issuer.metadata.issuer;
    const index = issuer.indexOf('/realms');
    if (index === -1) {
        return null;
    }
    return issuer.substring(0, index);
};

export const getUrlForKeycloakAccountPage = async () => {
    const baseUrl = await getAuthBaseUrl();
    return `${baseUrl}${realmPath}/account`;
};
