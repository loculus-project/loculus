import { inspect } from 'util';

import { type BaseClient, Issuer } from 'openid-client';

import { getClientMetadata } from './clientMetadata.ts';
import { realmPath } from './realmPath.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

const instanceLogger = getInstanceLogger('KeycloakClientManager');

// Helper for rich object logging
function inspectForLog(obj: any): string {
    return inspect(obj, {
        depth: 5, // Go deeper into nested objects
        colors: false, // Disable colors for log files
        maxArrayLength: null, // Don't truncate arrays
        maxStringLength: null, // Don't truncate strings
        compact: false, // More readable format
        showHidden: true, // Show non-enumerable properties
    });
}

export class KeycloakClientManager {
    private static _keycloakClient: BaseClient | undefined;
    private static readonly logger = instanceLogger;

    public static async getClient(): Promise<BaseClient | undefined> {
        if (this._keycloakClient !== undefined) {
            return this._keycloakClient;
        }

        const originForClient = getRuntimeConfig().serverSide.keycloakUrl;
        const issuerUrl = `${originForClient}${realmPath}`;

        try {
            const keycloakIssuer = await Issuer.discover(issuerUrl);
            // this.logger.info(`Keycloak issuer discovered: ${keycloakIssuer}`);
            // better logging of the issuer
            // let's stringify the whole thing
            this.logger.info(`Keycloak issuer discovered: ${inspectForLog(keycloakIssuer)}`);
            this._keycloakClient = new keycloakIssuer.Client(getClientMetadata());
        } catch (error: any) {
            if (error.code !== 'ECONNREFUSED') {
                this.logger.error(`Error discovering keycloak issuer: ${error}`);
                throw error;
            }
            this.logger.warn(`Connection refused when trying to discover the keycloak issuer at url: ${issuerUrl}`);
        }

        return this._keycloakClient;
    }
}
