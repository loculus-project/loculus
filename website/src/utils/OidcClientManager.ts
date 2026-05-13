import { type BaseClient, Issuer } from 'openid-client';

import { getClientMetadata } from './clientMetadata.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

let _client: BaseClient | undefined;
const logger = getInstanceLogger('OidcClientManager');

export const OidcClientManager = {
    getClient: async (): Promise<BaseClient | undefined> => {
        if (_client !== undefined) {
            return _client;
        }

        const issuerUrl = getRuntimeConfig().serverSide.autheliaUrl;
        logger.info(`Discovering OIDC issuer at ${issuerUrl}`);

        try {
            const issuer = await Issuer.discover(issuerUrl);
            logger.info(`OIDC issuer discovered: ${issuerUrl}`);
            _client = new issuer.Client(getClientMetadata());
        } catch (error) {
            // @ts-expect-error -- `code` maybe doesn't exist on error
            if (error?.code !== 'ECONNREFUSED') {
                logger.error(`Error discovering OIDC issuer: ${error}`);
                throw error;
            }
            logger.warn(`Connection refused when trying to discover the OIDC issuer at: ${issuerUrl}`);
        }

        return _client;
    },
};
