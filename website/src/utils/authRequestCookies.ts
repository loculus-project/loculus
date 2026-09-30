import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import type { AstroCookies } from 'astro';

import { getRuntimeConfig } from '../config.ts';
import { routes } from '../routes/routes.ts';

export const AUTH_TRANSACTIONS_COOKIE = 'oidc_transactions';

const transactionLifetimeSeconds = 60 * 60;
const maxConcurrentTransactions = 3;
// Leave room for cookie attributes and browser differences below the 4 KiB limit.
const maxCookieBytes = 3800;

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
    // JSON parsing restores Object.prototype; rebuild a prototype-free dictionary before keyed access.
    return Object.assign(
        Object.create(null) as AuthRequestStore,
        Object.fromEntries(
            Object.entries(store).filter(
                (entry): entry is [string, StoredAuthRequest] => entry[1] !== undefined && entry[1].expiresAt > now,
            ),
        ),
    );
}

function fitsCookieBudget(sealedStore: string): boolean {
    return Buffer.byteLength(`${AUTH_TRANSACTIONS_COOKIE}=${sealedStore}`, 'utf8') <= maxCookieBytes;
}

function writeStore(cookies: AstroCookies, store: AuthRequestStore, sealedStore?: string) {
    if (Object.keys(store).length === 0) {
        cookies.delete(AUTH_TRANSACTIONS_COOKIE, { path: '/' });
        return;
    }

    const runtimeConfig = getRuntimeConfig();
    cookies.set(AUTH_TRANSACTIONS_COOKIE, sealedStore ?? seal(store), {
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
    const transaction: StoredAuthRequest = {
        nonce,
        codeVerifier,
        returnTo,
        expiresAt: Date.now() + transactionLifetimeSeconds * 1000,
    };

    // Reserve space for this attempt first, including when replica clocks differ.
    const boundedStore: AuthRequestStore = Object.assign(Object.create(null), { [state]: transaction });
    let sealedStore = seal(boundedStore);
    if (!fitsCookieBudget(sealedStore)) {
        // The caller supplies an absolute, same-origin URL. Preserve it unless it cannot
        // fit even on its own; never redirect to Keycloak with an unstorable transaction.
        transaction.returnTo = new URL(routes.userOverviewPage(), returnTo).toString();
        sealedStore = seal(boundedStore);
        if (!fitsCookieBudget(sealedStore)) {
            throw new Error('OIDC login transaction exceeds the cookie size limit');
        }
    }

    const previousTransactions = Object.entries(existingStore)
        .filter((entry): entry is [string, StoredAuthRequest] => entry[0] !== state && entry[1] !== undefined)
        .sort(([, left], [, right]) => right.expiresAt - left.expiresAt)
        .slice(0, maxConcurrentTransactions - 1);
    for (const [previousState, previousTransaction] of previousTransactions) {
        boundedStore[previousState] = previousTransaction;
        const candidate = seal(boundedStore);
        if (!fitsCookieBudget(candidate)) {
            delete boundedStore[previousState];
            break; // This and any older entries are evicted to keep the new attempt usable.
        }
        sealedStore = candidate;
    }
    writeStore(cookies, boundedStore, sealedStore);
}

export function consumeAuthRequest(cookies: AstroCookies, state: string | undefined): AuthRequest | undefined {
    if (state === undefined) {
        return undefined;
    }

    const store = activeTransactions(unseal(cookies.get(AUTH_TRANSACTIONS_COOKIE)?.value));
    // Only an own property can represent an issued transaction. Keep this explicit guard even
    // with a prototype-free store so future changes cannot reintroduce inherited-key matches.
    const transaction = Object.prototype.hasOwnProperty.call(store, state) ? store[state] : undefined;
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
