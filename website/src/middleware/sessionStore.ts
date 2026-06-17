import { randomBytes } from 'crypto';

/**
 * Server-side session store for the browser session.
 *
 * Instead of putting the OIDC tokens (access / id / refresh) into the user's
 * browser as cookies, we keep them here on the server and hand the browser only
 * an opaque, unguessable session id. This makes the browser session revocable
 * (drop the entry server-side and it's gone immediately) and keeps the JWTs off
 * the client entirely.
 *
 * Storage is an in-process Map, which is correct for the default single-replica
 * website deployment (`replicas.website: 1`). Its limitations are deliberate and
 * documented:
 *   - sessions are lost when the website process restarts (e.g. on redeploy),
 *     logging users out;
 *   - it is not shared across replicas.
 * A deployment that scales the website horizontally should replace this module
 * with a shared store (e.g. Redis / Postgres) exposing the same
 * get/put/delete/create interface — no other code needs to change.
 */

// Idle lifetime of a server-side session. Refreshed on every access so active
// users stay logged in; abandoned sessions are reaped lazily on read and by the
// periodic sweep below.
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

interface StoredSession {
    tokens: TokenCookie;
    expiresAt: number;
}

const sessions = new Map<string, StoredSession>();

export function createSessionId(): string {
    return randomBytes(32).toString('base64url');
}

export function getSessionTokens(sessionId: string | undefined): TokenCookie | undefined {
    if (sessionId === undefined) {
        return undefined;
    }
    const entry = sessions.get(sessionId);
    if (entry === undefined) {
        return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
        sessions.delete(sessionId);
        return undefined;
    }
    // Sliding expiration: touch on access so active sessions don't expire.
    entry.expiresAt = Date.now() + SESSION_TTL_MS;
    return entry.tokens;
}

export function putSessionTokens(sessionId: string, tokens: TokenCookie): void {
    sessions.set(sessionId, { tokens, expiresAt: Date.now() + SESSION_TTL_MS });
}

export function deleteSession(sessionId: string | undefined): void {
    if (sessionId !== undefined) {
        sessions.delete(sessionId);
    }
}

// Lazy reads already drop expired entries, but abandoned sessions that are never
// read again would linger; sweep them periodically so the Map can't grow without
// bound. `unref` keeps the timer from holding the process open.
const SWEEP_INTERVAL_MS = 1000 * 60 * 60; // hourly
const sweepTimer = setInterval(() => {
    const nowMs = Date.now();
    for (const [id, entry] of sessions) {
        if (entry.expiresAt <= nowMs) {
            sessions.delete(id);
        }
    }
}, SWEEP_INTERVAL_MS);
// Don't let the sweep timer keep the process alive.
sweepTimer.unref();
