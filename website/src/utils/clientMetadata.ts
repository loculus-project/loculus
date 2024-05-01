// TODO: #1337 Move to config
import { getRuntimeConfig } from '../config';

const clientMetadata = {
    client_id: 'backend-client',
    response_types: ['code', 'id_token'],
    public: true,
};

export const getClientMetadata = () => {
    const configDir = import.meta.env.CONFIG_DIR;
    let backendKeycloakClientSecret;
    if (typeof configDir !== 'string' || configDir === '') {
        backendKeycloakClientSecret = 'dummySecret';
    } else {
        backendKeycloakClientSecret = getRuntimeConfig().backendKeycloakClientSecret;
    }

    return { ...clientMetadata, client_secret: backendKeycloakClientSecret };
};
