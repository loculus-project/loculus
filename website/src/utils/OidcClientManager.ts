import { type OutgoingHttpHeaders } from 'http';

import { type BaseClient, type HttpOptions, Issuer, custom } from 'openid-client';

import { getClientMetadata } from './clientMetadata.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

let _client: BaseClient | undefined;
const logger = getInstanceLogger('OidcClientManager');

export function getAutheliaForwardedHeaders() {
    const publicUrl = new URL(getRuntimeConfig().serverSide.autheliaPublicUrl);
    return {
        /* eslint-disable @typescript-eslint/naming-convention */
        'X-Forwarded-Proto': publicUrl.protocol.replace(':', ''),
        'X-Forwarded-Host': publicUrl.host,
        'X-Forwarded-Port': publicUrl.port || (publicUrl.protocol === 'https:' ? '443' : '80'),
        /* eslint-enable @typescript-eslint/naming-convention */
    };
}

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
        revocation_endpoint: `${internal}/api/oidc/revocation`,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        introspection_endpoint: `${internal}/api/oidc/introspection`,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        device_authorization_endpoint: `${pub}/api/oidc/device-authorization`,
    });
}

function isRawHeaderList(headers: OutgoingHttpHeaders | readonly string[] | undefined): headers is readonly string[] {
    return Array.isArray(headers);
}

function normalizeHeaders(headers: OutgoingHttpHeaders | readonly string[] | undefined): OutgoingHttpHeaders {
    if (!isRawHeaderList(headers)) {
        return headers ?? {};
    }

    const normalized: OutgoingHttpHeaders = {};
    for (let index = 0; index < headers.length - 1; index += 2) {
        normalized[headers[index]] = headers[index + 1];
    }
    return normalized;
}

function withAutheliaForwardedHeaders(
    options: HttpOptions,
    forwardedHeaders: ReturnType<typeof getAutheliaForwardedHeaders>,
): HttpOptions {
    return {
        ...options,
        headers: {
            ...normalizeHeaders(options.headers),
            ...forwardedHeaders,
        },
    };
}

export const OidcClientManager = {
    // Kept async for callsite compatibility (the previous implementation used
    // `Issuer.discover`); building the client is now synchronous.
    // eslint-disable-next-line @typescript-eslint/require-await
    getClient: async (): Promise<BaseClient | undefined> => {
        if (_client !== undefined) {
            return _client;
        }
        try {
            const internal = getRuntimeConfig().serverSide.autheliaUrl;
            const pub = getRuntimeConfig().serverSide.autheliaPublicUrl;
            logger.info(`Building OIDC client (internal=${internal}, public=${pub})`);
            const issuer = buildIssuer(internal, pub);
            const forwardedHeaders = getAutheliaForwardedHeaders();
            issuer[custom.http_options] = (_url, options) => withAutheliaForwardedHeaders(options, forwardedHeaders);
            _client = new issuer.Client(getClientMetadata());
            // Authelia derives its issuer URL from request headers. Server-side
            // calls hit the in-cluster service directly (HTTP, no proxy), so
            // without these forwarded headers it would derive a wrong issuer
            // and reject the token exchange with `invalid_grant` / `server_error`.
            _client[custom.http_options] = (_url, options) => withAutheliaForwardedHeaders(options, forwardedHeaders);
        } catch (error) {
            logger.error(`Error building OIDC client: ${String(error)}`);
        }
        return _client;
    },
};
