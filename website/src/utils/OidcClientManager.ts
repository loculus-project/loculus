import { type BaseClient, Issuer } from 'openid-client';

import { getClientMetadata } from './clientMetadata.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

let _client: BaseClient | undefined;
const logger = getInstanceLogger('OidcClientManager');

// We construct the Authelia OIDC client from a fixed metadata table rather than
// running `.well-known/openid-configuration` discovery. Authelia derives the
// issuer URL from the incoming request's Host and X-Forwarded-Proto headers,
// and our server-side calls land directly on the in-cluster Authelia service
// (no proxy) so the issuer it returns is the internal http URL — which makes
// downstream token validation fail. Hardcoding sidesteps that.
function buildIssuer(internalUrl: string, publicUrl: string): Issuer {
    const internal = internalUrl.replace(/\/+$/, '');
    const pub = publicUrl.replace(/\/+$/, '');
    return new Issuer({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        issuer: pub,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        authorization_endpoint: `${pub}/api/oidc/authorization`,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        token_endpoint: `${internal}/api/oidc/token`,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        userinfo_endpoint: `${internal}/api/oidc/userinfo`,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        jwks_uri: `${internal}/jwks.json`,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        end_session_endpoint: `${pub}/api/oidc/logout`,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        revocation_endpoint: `${internal}/api/oidc/revocation`,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        introspection_endpoint: `${internal}/api/oidc/introspection`,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        device_authorization_endpoint: `${pub}/api/oidc/device-authorization`,
    });
}

export const OidcClientManager = {
    getClient: async (): Promise<BaseClient | undefined> => {
        if (_client !== undefined) {
            return _client;
        }
        try {
            const internal = getRuntimeConfig().serverSide.autheliaUrl;
            const pub = getRuntimeConfig().serverSide.autheliaPublicUrl;
            logger.info(`Building OIDC client (internal=${internal}, public=${pub})`);
            const issuer = buildIssuer(internal, pub);
            _client = new issuer.Client(getClientMetadata());
        } catch (error) {
            logger.error(`Error building OIDC client: ${error as unknown as string}`);
        }
        return _client;
    },
};
