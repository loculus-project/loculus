import type { AstroCookies } from 'astro';

import { getRuntimeConfig } from '../config.ts';

export const AUTH_STATE_COOKIE = 'auth_state';
export const AUTH_NONCE_COOKIE = 'auth_nonce';

// The auth flow should complete within a couple of minutes; keep this short-lived.
const maxAge = 5 * 60;

export function setAuthRequestCookies(cookies: AstroCookies, state: string, nonce: string) {
    const runtimeConfig = getRuntimeConfig();
    const options = {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: !runtimeConfig.insecureCookies,
        path: '/',
        maxAge,
    };
    cookies.set(AUTH_STATE_COOKIE, state, options);
    cookies.set(AUTH_NONCE_COOKIE, nonce, options);
}

export function popAuthRequestCookies(cookies: AstroCookies) {
    const state = cookies.get(AUTH_STATE_COOKIE)?.value;
    const nonce = cookies.get(AUTH_NONCE_COOKIE)?.value;
    cookies.delete(AUTH_STATE_COOKIE, { path: '/' });
    cookies.delete(AUTH_NONCE_COOKIE, { path: '/' });
    return { state, nonce };
}
