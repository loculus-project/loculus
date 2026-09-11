import type { APIContext } from 'astro';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    addAuthRequest: vi.fn(),
    authorizationUrl: vi.fn((_parameters: Record<string, string>) => 'https://auth.test/authorize'),
    getClient: vi.fn(),
}));

vi.mock('../../utils/KeycloakClientManager.ts', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    KeycloakClientManager: {
        getClient: mocks.getClient,
    },
}));

vi.mock('../../utils/authRequestCookies.ts', () => ({
    addAuthRequest: mocks.addAuthRequest,
}));

import { GET } from './login.ts';

function contextFor(url: string): APIContext {
    return {
        url: new URL(url),
        cookies: {},
        redirect: (location: string) => new Response(null, { status: 302, headers: { location } }),
    } as unknown as APIContext;
}

describe('/auth/login', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getClient.mockResolvedValue({
            authorizationUrl: mocks.authorizationUrl,
        });
    });

    test('requires a returnTo destination', async () => {
        const response = await GET(contextFor('https://loculus.test/auth/login'));

        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Missing returnTo');
        expect(mocks.getClient).not.toHaveBeenCalled();
    });

    test('rejects a returnTo destination on another origin', async () => {
        const response = await GET(
            contextFor('https://loculus.test/auth/login?returnTo=https://attacker.test/after-login'),
        );

        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Invalid returnTo');
        expect(mocks.getClient).not.toHaveBeenCalled();
    });

    test('rejects a protocol-relative returnTo destination on another origin', async () => {
        const response = await GET(
            contextFor('https://loculus.test/auth/login?returnTo=%2F%2Fattacker.test%2Fafter-login'),
        );

        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Invalid returnTo');
        expect(mocks.getClient).not.toHaveBeenCalled();
    });

    test('redirects to the service-unavailable page when Keycloak is unavailable', async () => {
        mocks.getClient.mockResolvedValue(undefined);

        const response = await GET(contextFor('https://loculus.test/auth/login?returnTo=%2Fuser'));

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('/503?service=Authentication');
    });

    test('creates a transaction and sends state, nonce, and S256 PKCE to the fixed callback', async () => {
        const returnTo = 'https://loculus.test/ebola/submission?group=4';
        const response = await GET(
            contextFor(`https://loculus.test/auth/login?returnTo=${encodeURIComponent(returnTo)}`),
        );

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('https://auth.test/authorize');

        const authorizationParameters = mocks.authorizationUrl.mock.calls[0][0];
        /* eslint-disable @typescript-eslint/naming-convention */
        expect(authorizationParameters).toMatchObject({
            redirect_uri: 'https://loculus.test/auth/callback',
            scope: 'openid',
            response_type: 'code',
            code_challenge_method: 'S256',
        });
        /* eslint-enable @typescript-eslint/naming-convention */
        expect(authorizationParameters.state).toEqual(expect.any(String));
        expect(authorizationParameters.nonce).toEqual(expect.any(String));
        expect(authorizationParameters.code_challenge).toEqual(expect.any(String));

        expect(mocks.addAuthRequest).toHaveBeenCalledWith(
            expect.anything(),
            authorizationParameters.state,
            authorizationParameters.nonce,
            expect.any(String),
            returnTo,
        );
    });
});
