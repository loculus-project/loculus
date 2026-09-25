import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import type { AstroCookies } from 'astro';
import { z } from 'zod';

import { getRuntimeConfig } from '../config.ts';
import { routes } from '../routes/routes.ts';

// Written by earlier versions of the website, which kept all pending logins in one cookie on path=/.
export const LEGACY_AUTH_TRANSACTIONS_COOKIE = 'oidc_transactions';
const cookiePrefix = 'oidc_tx_';
const transactionLifetimeSeconds = 60 * 60;

// openid-client's generators.state() returns 32 random bytes as base64url.
const statePattern = /^[A-Za-z0-9_-]{43}$/;

const storedAuthRequestSchema = z.object({
    state: z.string(),
    nonce: z.string().min(1),
    codeVerifier: z.string().min(1),
    returnTo: z.string(),
    expiresAt: z.number(),
});

type StoredAuthRequest = z.infer<typeof storedAuthRequestSchema>;

export type AuthRequest = Omit<StoredAuthRequest, 'expiresAt'>;

export function isValidState(state: unknown): state is string {
    return typeof state === 'string' && statePattern.test(state);
}

export function authTransactionCookieName(state: string) {
    return `${cookiePrefix}${state}`;
}

function cookiePath() {
    return routes.authCallback();
}

function encryptionKey() {
    return createHash('sha256').update(getRuntimeConfig().oidcTransactionCookieSecret).digest();
}

function seal(transaction: StoredAuthRequest): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(transaction), 'utf8'), cipher.final()]);
    const authenticationTag = cipher.getAuthTag();
    return [
        'v1',
        iv.toString('base64url'),
        ciphertext.toString('base64url'),
        authenticationTag.toString('base64url'),
    ].join('.');
}

function unseal(value: string): unknown {
    try {
        const parts = value.split('.');
        if (parts.length !== 4 || parts[0] !== 'v1') {
            return undefined;
        }
        const [, encodedIv, encodedCiphertext, encodedAuthenticationTag] = parts;
        const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(encodedIv, 'base64url'));
        decipher.setAuthTag(Buffer.from(encodedAuthenticationTag, 'base64url'));
        const plaintext = Buffer.concat([
            decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
            decipher.final(),
        ]).toString('utf8');
        return JSON.parse(plaintext);
    } catch {
        return undefined;
    }
}

export function addAuthRequest(
    cookies: AstroCookies,
    state: string,
    nonce: string,
    codeVerifier: string,
    returnTo: string,
) {
    if (cookies.has(LEGACY_AUTH_TRANSACTIONS_COOKIE)) {
        cookies.delete(LEGACY_AUTH_TRANSACTIONS_COOKIE, { path: '/' });
    }

    const transaction = {
        state,
        nonce,
        codeVerifier,
        returnTo,
        expiresAt: Date.now() + transactionLifetimeSeconds * 1000,
    };
    cookies.set(authTransactionCookieName(state), seal(transaction), {
        httpOnly: true,
        sameSite: 'lax',
        secure: !getRuntimeConfig().insecureCookies,
        path: cookiePath(),
        maxAge: transactionLifetimeSeconds,
    });
}

export function consumeAuthRequest(cookies: AstroCookies, state: unknown): AuthRequest | undefined {
    if (!isValidState(state)) {
        return undefined;
    }

    const name = authTransactionCookieName(state);
    const value = cookies.get(name)?.value;
    if (value === undefined) {
        return undefined;
    }
    cookies.delete(name, { path: cookiePath() });

    const parsed = storedAuthRequestSchema.safeParse(unseal(value));
    if (!parsed.success || parsed.data.state !== state || parsed.data.expiresAt <= Date.now()) {
        return undefined;
    }
    const { expiresAt: _, ...authRequest } = parsed.data;
    return authRequest;
}

export function authTransactionId(state: unknown): string {
    if (state === undefined) {
        return 'missing';
    }
    if (!isValidState(state)) {
        return 'invalid';
    }
    return createHash('sha256').update(state).digest('hex').slice(0, 12);
}
