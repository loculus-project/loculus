import { type BaseClient } from 'openid-client';

import { realmPath } from './realmPath.ts';

export function urlForKeycloakAccountPage(client: BaseClient) {
    const endsessionUrl = client.endSessionUrl();
    const url = new URL(endsessionUrl);
    return `${url.protocol}//${url.host}${realmPath}/account`;
}
