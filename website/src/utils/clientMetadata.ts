import { getRuntimeConfig } from '../config';

const clientMetadata = {
    client_id: 'backend-client',
    response_types: ['code', 'id_token'],
    public: true,
};

export const getClientMetadata = () => {
    return { ...clientMetadata, client_secret: getClientSecret() };
};

const getClientSecret = () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (import.meta.env === undefined) {
        return 'dummySecret';
    }
    const configDir = import.meta.env.CONFIG_DIR;
    if (typeof configDir !== 'string' || configDir === '') {
        return 'dummySecret';
    }
    return getRuntimeConfig().backendKeycloakClientSecret;
};
