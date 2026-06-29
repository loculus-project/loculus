import { getRuntimeConfig } from '../config';

/* eslint-disable @typescript-eslint/naming-convention */
const clientMetadata = {
    client_id: 'backend-client',
    response_types: ['code', 'id_token'],
    public: true,
};
/* eslint-enable @typescript-eslint/naming-convention */

export const getClientMetadata = () => {
    return { ...clientMetadata, client_secret: getClientSecret() }; // eslint-disable-line @typescript-eslint/naming-convention
};

const getClientSecret = () => {
    const configDir = import.meta.env.CONFIG_DIR;
    if (typeof configDir !== 'string' || configDir === '') {
        return 'dummySecret';
    }
    return getRuntimeConfig().backendKeycloakClientSecret;
};
