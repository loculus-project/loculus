import type { BaseClient } from 'openid-client';
import { describe, expect, test } from 'vitest';

import { urlForKeycloakAccountPage } from './urlForKeycloakAccountPage';

function createClient(url: string): BaseClient {
    return {
        endSessionUrl: () => url,
    } as unknown as BaseClient;
} 

describe('urlForKeycloakAccountPage', () => {
    test('uses https issuer', () => {
        const client = createClient('https://kc.example.com/realms/loculus/protocol/openid-connect/logout');
        expect(urlForKeycloakAccountPage(client)).toBe('https://kc.example.com/realms/loculus/account');
    });

    test('uses http issuer', () => {
        const client = createClient('http://kc.example.com/realms/loculus/protocol/openid-connect/logout');
        expect(urlForKeycloakAccountPage(client)).toBe('http://kc.example.com/realms/loculus/account');
    });
});
