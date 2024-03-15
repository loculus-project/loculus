import { KeycloakClientManager } from './KeycloakClientManager';
import { routes } from '../routes/routes';

export const getAuthUrl = async (redirectUrl: string) => {
    const logout = routes.logout();
    if (redirectUrl.endsWith(logout)) {
        redirectUrl = redirectUrl.replace(logout, routes.userOverviewPage());
    }

    // Beware: relative url does not work with Redirect.response()
    const client = await KeycloakClientManager.getClient();
    if (client === undefined) {
        return `/503?service=Authentication`;
    }
    const authUrl = client.authorizationUrl({
        redirect_uri: redirectUrl,
        scope: 'openid',
        response_type: 'code',
    });
    return authUrl;
};
