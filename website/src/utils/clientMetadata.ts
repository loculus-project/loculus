// TODO: #1337 Move to config
import { getRuntimeConfig } from '../config';

const clientMetadata = {
    client_id: 'backend-client',
    response_types: ['code', 'id_token'],
    public: true,
};

export const getClientMetadata = () => {
    return { ...clientMetadata, client_secret: getRuntimeConfig().backendKeycloakClientSecret };
};
