import { OidcClientManager } from './OidcClientManager';
import { getRuntimeConfig } from '../config';
import { routes } from '../routes/routes';

export const getAuthUrl = async (redirectUrl: string) => {
    const logout = routes.logout();
    if (redirectUrl.endsWith(logout)) {
        redirectUrl = redirectUrl.replace(logout, routes.userOverviewPage());
    }

    // Beware: relative url does not work with Redirect.response()
    const client = await OidcClientManager.getClient();
    if (client === undefined) {
        return `/503?service=Authentication`;
    }
    /* eslint-disable @typescript-eslint/naming-convention */
    return client.authorizationUrl({
        redirect_uri: redirectUrl,
        scope: 'openid profile email groups offline_access',
        response_type: 'code',
    });
    /* eslint-enable @typescript-eslint/naming-convention */
};

// External-facing base URL of the auth provider (Authelia). Used in user-facing
// API documentation and `/loculus-info` for CLI discovery.
export const getAuthBaseUrl = async () => {
    return getRuntimeConfig().serverSide.autheliaPublicUrl;
};

// Authelia exposes a self-service portal at the root of the auth URL.
export const getUrlForAccountPage = async () => {
    return await getAuthBaseUrl();
};
