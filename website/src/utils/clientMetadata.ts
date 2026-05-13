/* eslint-disable @typescript-eslint/naming-convention */
const clientMetadata = {
    client_id: 'backend-client',
    response_types: ['code'],
    token_endpoint_auth_method: 'none' as const,
    public: true,
};
/* eslint-enable @typescript-eslint/naming-convention */

export const getClientMetadata = () => {
    return clientMetadata;
};
