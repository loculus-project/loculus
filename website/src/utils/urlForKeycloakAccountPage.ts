import { type BaseClient } from 'openid-client';

import { realmPath } from './realmPath.ts';

export function urlForKeycloakAccountPage(client: BaseClient) {
    const endsessionUrl = client.endSessionUrl();
    const host = new URL(endsessionUrl).host;
    return `https://${host}${realmPath}/account`;
}
