import { generators } from 'openid-client';

import { OidcClientManager } from './OidcClientManager';
import { getRuntimeConfig } from '../config';
import { routes } from '../routes/routes';

// Authelia (unlike Keycloak) requires every redirect_uri to be pre-registered
// exactly — wildcards aren't supported. We pin the OIDC callback to a single
// fixed path and encode the user's original target URL plus a PKCE code
// verifier inside the opaque `state` parameter so the callback handler can
// resume the navigation and complete the token exchange.
export const AUTH_CALLBACK_PATH = '/auth/callback';

const NONCE_LEN = 16;

interface StatePayload {
    n: string; // nonce (CSRF binding)
    r: string; // returnTo URL
    v: string; // PKCE code_verifier
}

function encodeState(payload: StatePayload): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeState(state: string | undefined): StatePayload | undefined {
    if (!state) return undefined;
    try {
        const raw = Buffer.from(state, 'base64url').toString('utf8');
        const obj = JSON.parse(raw) as unknown;
        if (typeof obj !== 'object' || obj === null) return undefined;
        const payload = obj as Record<string, unknown>;
        if (typeof payload.n !== 'string' || typeof payload.r !== 'string' || typeof payload.v !== 'string') {
            return undefined;
        }
        return { n: payload.n, r: payload.r, v: payload.v };
    } catch {
        return undefined;
    }
}

function callbackUri(currentUrl: URL): string {
    const u = new URL(AUTH_CALLBACK_PATH, currentUrl);
    u.search = '';
    u.hash = '';
    return u.toString();
}

export const getAuthUrl = async (redirectUrl: string) => {
    const logout = routes.logout();
    if (redirectUrl.endsWith(logout)) {
        redirectUrl = redirectUrl.replace(logout, routes.userOverviewPage());
    }

    // Beware: relative url does not work with Redirect.response()
    const client = await OidcClientManager.getClient();
    if (client === undefined) {
        return `/503?service=Authentication`;
    }
    const target = new URL(redirectUrl);
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const nonce = generators.state().slice(0, NONCE_LEN);
    /* eslint-disable @typescript-eslint/naming-convention */
    return client.authorizationUrl({
        redirect_uri: callbackUri(target),
        scope: 'openid profile email groups offline_access',
        response_type: 'code',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: encodeState({ n: nonce, r: target.toString(), v: codeVerifier }),
    });
    /* eslint-enable @typescript-eslint/naming-convention */
};

// External-facing base URL of the auth provider (Authelia). Used in user-facing
// API documentation and `/loculus-info` for CLI discovery.
export const getAuthBaseUrl = (): string => {
    return getRuntimeConfig().serverSide.autheliaPublicUrl;
};

// Authelia exposes a self-service portal at the root of the auth URL.
export const getUrlForAccountPage = (): string => getAuthBaseUrl();
