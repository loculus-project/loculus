import { KeycloakClientManager } from './KeycloakClientManager';
import { realmPath } from './realmPath.ts';
import { routes } from '../routes/routes';

export const getLoginUrl = (returnTo: string) => {
    const logout = routes.logout();
    if (returnTo.endsWith(logout)) {
        returnTo = returnTo.replace(logout, routes.userOverviewPage());
    }
    return routes.authLogin(returnTo);
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
