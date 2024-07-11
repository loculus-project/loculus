import { type BaseClient, Issuer } from 'openid-client';

import { realmPath } from './realmPath.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { getClientMetadata } from '../utils/clientMetadata.ts';

export class KeycloakClientManager {
    private static _keycloakClient: BaseClient | undefined;
    private static readonly logger = getInstanceLogger('LoginMiddleware'); // Assuming getInstanceLogger is available

    public static async getClient(): Promise<BaseClient | undefined> {
        if (this._keycloakClient !== undefined) {
            return this._keycloakClient;
        }

        const originForClient = getRuntimeConfig().serverSide.keycloakUrl;
        const issuerUrl = `${originForClient}${realmPath}`;

        this.logger.info(`Getting keycloak client for issuer url: ${issuerUrl}`);

        try {
            const keycloakIssuer = await Issuer.discover(issuerUrl);
            this.logger.info(`Keycloak issuer discovered: ${keycloakIssuer}`);
            this._keycloakClient = new keycloakIssuer.Client(getClientMetadata());
        } catch (error: any) {
            if (error.code !== 'ECONNREFUSED') {
                this.logger.error(`Error discovering keycloak issuer: ${error}`);
                //throw error;
            }
            this.logger.warn(`Connection refused when trying to discover the keycloak issuer at url: ${issuerUrl}`);
        }

        return this._keycloakClient;
    }
}
