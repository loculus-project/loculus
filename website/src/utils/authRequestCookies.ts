import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import type { AstroCookies } from 'astro';
import { z } from 'zod';

import { getRuntimeConfig } from '../config.ts';
import { routes } from '../routes/routes.ts';

export const AUTH_TRANSACTIONS_COOKIE = 'oidc_transactions';

const transactionLifetimeSeconds = 60 * 60;
const maxConcurrentTransactions = 3;
// Leave room for cookie attributes and browser differences below the 4 KiB limit.
const maxCookieBytes = 3800;
const ivLength = 12;
const authenticationTagLength = 16;

const storedAuthRequestSchema = z.object({
    nonce: z.string(),
    codeVerifier: z.string(),
    returnTo: z.string(),
    expiresAt: z.number(),
});

type StoredAuthRequest = z.infer<typeof storedAuthRequestSchema>;

// The OIDC `state` parameter that identifies one login attempt.
type OidcState = string;

// Map entries are separate from object properties, so attacker-controlled state keys like "constructor" cannot match inherited members.
type AuthRequestStore = Map<OidcState, StoredAuthRequest>;

export type AuthRequest = {
    nonce: string;
    codeVerifier: string;
    returnTo: string;
};

function encryptionKey() {
    return createHash('sha256').update(getRuntimeConfig().oidcTransactionCookieSecret).digest();
}

function seal(store: AuthRequestStore): string {
    const iv = randomBytes(ivLength);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv, { authTagLength: authenticationTagLength });
    const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(Object.fromEntries(store)), 'utf8'),
        cipher.final(),
    ]);
    const authenticationTag = cipher.getAuthTag();
    return [
        'v1',
        iv.toString('base64url'),
        ciphertext.toString('base64url'),
        authenticationTag.toString('base64url'),
    ].join('.');
}

// Validate entries individually rather than with z.record, which rebuilds the object by assignment and would
// turn a "__proto__" key into a prototype change instead of an entry.
function parseStore(parsed: unknown): AuthRequestStore {
    const store: AuthRequestStore = new Map();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return store;
    }
    for (const [state, value] of Object.entries(parsed)) {
        const transaction = storedAuthRequestSchema.safeParse(value);
        if (transaction.success) {
            store.set(state, transaction.data);
        }
    }
    return store;
}

function unseal(value: string | undefined): AuthRequestStore {
    if (value === undefined) {
        return new Map<OidcState, StoredAuthRequest>();
    }

    try {
        const parts = value.split('.');
        if (parts.length !== 4 || parts[0] !== 'v1') {
            return new Map<OidcState, StoredAuthRequest>();
        }
        const [, encodedIv, encodedCiphertext, encodedAuthenticationTag] = parts;
        const iv = Buffer.from(encodedIv, 'base64url');
        const authenticationTag = Buffer.from(encodedAuthenticationTag, 'base64url');
        if (iv.length !== ivLength || authenticationTag.length !== authenticationTagLength) {
            return new Map<OidcState, StoredAuthRequest>();
        }
        const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv, {
            authTagLength: authenticationTagLength,
        });
        decipher.setAuthTag(authenticationTag);
        const plaintext = Buffer.concat([
            decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
            decipher.final(),
        ]).toString('utf8');
        return parseStore(JSON.parse(plaintext));
    } catch {
        return new Map<OidcState, StoredAuthRequest>();
    }
}

function activeTransactions(store: AuthRequestStore, now = Date.now()): AuthRequestStore {
    return new Map([...store].filter(([, transaction]) => transaction.expiresAt > now));
}

function fitsCookieBudget(sealedStore: string): boolean {
    return Buffer.byteLength(`${AUTH_TRANSACTIONS_COOKIE}=${sealedStore}`, 'utf8') <= maxCookieBytes;
}

function writeStore(cookies: AstroCookies, store: AuthRequestStore, sealedStore?: string) {
    if (store.size === 0) {
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

    // Insert the new attempt unconditionally before adding older ones. Older entries are ranked by
    // expiresAt, which came from whichever replica's clock created them, so ranking the new entry
    // with them could evict it under clock skew.
    const boundedStore: AuthRequestStore = new Map([[state, transaction]]);
    let sealedStore = seal(boundedStore);
    if (!fitsCookieBudget(sealedStore)) {
        // The caller supplies an absolute, same-origin URL. Preserve it unless it cannot
        // fit even on its own; never redirect to Keycloak with an unstorable transaction.
        transaction.returnTo = new URL(routes.userOverviewPage(), new URL(returnTo).origin).toString();
        sealedStore = seal(boundedStore);
        if (!fitsCookieBudget(sealedStore)) {
            throw new Error('OIDC login transaction exceeds the cookie size limit');
        }
    }

    const previousTransactions = [...existingStore]
        .filter(([previousState]) => previousState !== state)
        .sort(([, left], [, right]) => right.expiresAt - left.expiresAt)
        .slice(0, maxConcurrentTransactions - 1);
    for (const [previousState, previousTransaction] of previousTransactions) {
        boundedStore.set(previousState, previousTransaction);
        const candidate = seal(boundedStore);
        if (!fitsCookieBudget(candidate)) {
            boundedStore.delete(previousState);
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
    const transaction = store.get(state);
    store.delete(state);
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
