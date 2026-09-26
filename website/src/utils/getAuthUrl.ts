import { KeycloakClientManager } from './KeycloakClientManager';
import { realmPath } from './realmPath.ts';

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
