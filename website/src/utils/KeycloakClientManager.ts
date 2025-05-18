import { type BaseClient, Issuer } from 'openid-client';

import { getClientMetadata } from './clientMetadata.ts';
import { realmPath } from './realmPath.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

let _keycloakClient: BaseClient | undefined;
const logger = getInstanceLogger('KeycloakClientManager');

export const KeycloakClientManager = {
    getClient: async (): Promise<BaseClient | undefined> => {
        if (_keycloakClient !== undefined) {
            return _keycloakClient;
        }

        const originForClient = getRuntimeConfig().serverSide.keycloakUrl;
        const issuerUrl = `${originForClient}${realmPath}`;

        logger.info(`Getting keycloak client for issuer url: ${issuerUrl}`);

        try {
            const keycloakIssuer = await Issuer.discover(issuerUrl);
            logger.info(`Keycloak issuer discovered: ${issuerUrl}`);
            _keycloakClient = new keycloakIssuer.Client(getClientMetadata());
        } catch (error) {
            // @ts-expect-error -- `code` maybe doesn't exist on error
            if (error?.code !== 'ECONNREFUSED') {
                logger.error(`Error discovering keycloak issuer: ${error}`);
                throw error;
            }
            logger.warn(`Connection refused when trying to discover the keycloak issuer at url: ${issuerUrl}`);
        }

        return _keycloakClient;
    },
};
