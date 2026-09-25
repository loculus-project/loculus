import { createHash } from 'node:crypto';

import type { AstroCookies } from 'astro';
import { EncryptJWT, jwtDecrypt } from 'jose';

import { getRuntimeConfig } from '../config.ts';

export const AUTH_TRANSACTIONS_COOKIE = 'oidc_transactions';

const transactionLifetimeSeconds = 60 * 60;
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

// Transactions sit under their own claim because their keys are the caller-supplied `state`,
// which must not collide with registered claims such as `exp`.
async function seal(store: AuthRequestStore): Promise<string> {
    return new EncryptJWT({ transactions: store })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setIssuedAt()
        .setExpirationTime(`${transactionLifetimeSeconds}s`)
        .encrypt(encryptionKey());
}

async function unseal(value: string | undefined): Promise<AuthRequestStore> {
    if (value === undefined) {
        return {};
    }

    try {
        const { payload } = await jwtDecrypt(value, encryptionKey(), {
            keyManagementAlgorithms: ['dir'],
            contentEncryptionAlgorithms: ['A256GCM'],
        });
        return payload.transactions as AuthRequestStore;
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

async function writeStore(cookies: AstroCookies, store: AuthRequestStore) {
    if (Object.keys(store).length === 0) {
        cookies.delete(AUTH_TRANSACTIONS_COOKIE, { path: '/' });
        return;
    }

    const runtimeConfig = getRuntimeConfig();
    cookies.set(AUTH_TRANSACTIONS_COOKIE, await seal(store), {
        httpOnly: true,
        sameSite: 'lax',
        secure: !runtimeConfig.insecureCookies,
        path: '/',
        maxAge: transactionLifetimeSeconds,
    });
}

export async function addAuthRequest(
    cookies: AstroCookies,
    state: string,
    nonce: string,
    codeVerifier: string,
    returnTo: string,
): Promise<void> {
    const existingStore = activeTransactions(await unseal(cookies.get(AUTH_TRANSACTIONS_COOKIE)?.value));
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
    await writeStore(cookies, boundedStore);
}

export async function consumeAuthRequest(
    cookies: AstroCookies,
    state: string | undefined,
): Promise<AuthRequest | undefined> {
    if (state === undefined) {
        return undefined;
    }

    const store = activeTransactions(await unseal(cookies.get(AUTH_TRANSACTIONS_COOKIE)?.value));
    const transaction = store[state];
    delete store[state];
    await writeStore(cookies, store);
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
