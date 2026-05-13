import { getRuntimeConfig } from '../config';

/* eslint-disable @typescript-eslint/naming-convention */
const baseMetadata = {
    client_id: 'backend-client',
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_basic' as const,
};
/* eslint-enable @typescript-eslint/naming-convention */

// Authelia 4.39 forbids http:// redirect URIs on public clients, so dev/CI
// (which serves the website over http) needs a confidential client with a
// real secret. The plaintext lives in the website's serverSide runtime
// config; Authelia stores the PBKDF2 hash and verifies against it.
export const getClientMetadata = () => {
    return {
        ...baseMetadata,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        client_secret: getRuntimeConfig().serverSide.oidcClientSecret,
    };
};
