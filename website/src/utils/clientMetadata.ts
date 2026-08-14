import { BACKEND_KEYCLOAK_CLIENT_SECRET } from 'astro:env/server';

/* eslint-disable @typescript-eslint/naming-convention */
const clientMetadata = {
    client_id: 'backend-client',
    response_types: ['code', 'id_token'],
    public: true,
};
/* eslint-enable @typescript-eslint/naming-convention */

export const getClientMetadata = () => {
    return {
        ...clientMetadata,
        client_secret: BACKEND_KEYCLOAK_CLIENT_SECRET, // eslint-disable-line @typescript-eslint/naming-convention
    };
};
