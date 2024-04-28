// TODO: #1337 Move to config
import { getRuntimeConfig } from "../config";
const runtimeConfig = getRuntimeConfig();

export const clientMetadata = {
    client_id: 'backend-client',
    response_types: ['code', 'id_token'],
    client_secret: runtimeConfig.backendKeycloakClientSecret,
    public: true,
};
