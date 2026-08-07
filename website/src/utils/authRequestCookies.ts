import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import type { AstroCookies } from 'astro';

import { getRuntimeConfig } from '../config.ts';

export const AUTH_TRANSACTIONS_COOKIE = 'oidc_transactions';

const transactionLifetimeSeconds = 5 * 60;
const maxConcurrentTransactions = 3;

type StoredAuthRequest = {
    nonce: string;
    codeVerifier: string;
    returnTo: string;
    expiresAt: number;
};

type AuthRequestStore = Record<string, StoredAuthRequest | undefined>;

export type AuthRequest = {
    nonce: string;
    codeVerifier: string;
    returnTo: string;
};

function encryptionKey() {
    return createHash('sha256').update(getRuntimeConfig().oidcTransactionCookieSecret).digest();
}

function seal(store: AuthRequestStore): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(store), 'utf8'), cipher.final()]);
    const authenticationTag = cipher.getAuthTag();
    return [
        'v1',
        iv.toString('base64url'),
        ciphertext.toString('base64url'),
        authenticationTag.toString('base64url'),
    ].join('.');
}

function unseal(value: string | undefined): AuthRequestStore {
    if (value === undefined) {
        return {};
    }

    try {
        const parts = value.split('.');
        if (parts.length !== 4 || parts[0] !== 'v1') {
            return {};
        }
        const [, encodedIv, encodedCiphertext, encodedAuthenticationTag] = parts;
        const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(encodedIv, 'base64url'));
        decipher.setAuthTag(Buffer.from(encodedAuthenticationTag, 'base64url'));
        const plaintext = Buffer.concat([
            decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
            decipher.final(),
        ]).toString('utf8');
        return JSON.parse(plaintext) as AuthRequestStore;
    } catch {
        return {};
    }
}

function activeTransactions(store: AuthRequestStore, now = Date.now()): AuthRequestStore {
    return Object.fromEntries(
        Object.entries(store).filter(
            (entry): entry is [string, StoredAuthRequest] => entry[1] !== undefined && entry[1].expiresAt > now,
        ),
    );
}

function writeStore(cookies: AstroCookies, store: AuthRequestStore) {
    if (Object.keys(store).length === 0) {
        cookies.delete(AUTH_TRANSACTIONS_COOKIE, { path: '/' });
        return;
    }

    const runtimeConfig = getRuntimeConfig();
    cookies.set(AUTH_TRANSACTIONS_COOKIE, seal(store), {
        httpOnly: true,
        sameSite: 'lax',
        secure: !runtimeConfig.insecureCookies,
        path: '/',
        maxAge: transactionLifetimeSeconds,
    });
}

export function addAuthRequest(
    cookies: AstroCookies,
    state: string,
    nonce: string,
    codeVerifier: string,
    returnTo: string,
) {
    const existingStore = activeTransactions(unseal(cookies.get(AUTH_TRANSACTIONS_COOKIE)?.value));
    existingStore[state] = {
        nonce,
        codeVerifier,
        returnTo,
        expiresAt: Date.now() + transactionLifetimeSeconds * 1000,
    };

    const boundedStore = Object.fromEntries(
        Object.entries(existingStore)
            .filter((entry): entry is [string, StoredAuthRequest] => entry[1] !== undefined)
            .sort(([, left], [, right]) => right.expiresAt - left.expiresAt)
            .slice(0, maxConcurrentTransactions),
    );
    writeStore(cookies, boundedStore);
}

export function consumeAuthRequest(cookies: AstroCookies, state: string | undefined): AuthRequest | undefined {
    const store = activeTransactions(unseal(cookies.get(AUTH_TRANSACTIONS_COOKIE)?.value));
    if (state === undefined) {
        writeStore(cookies, store);
        return undefined;
    }

    const transaction = store[state];
    delete store[state];
    writeStore(cookies, store);
    if (transaction === undefined) {
        return undefined;
    }
    return {
        nonce: transaction.nonce,
        codeVerifier: transaction.codeVerifier,
        returnTo: transaction.returnTo,
    };
}

export function authTransactionId(state: string | undefined): string {
    return state === undefined ? 'missing' : createHash('sha256').update(state).digest('hex').slice(0, 12);
}
