import diagnosticsChannel from 'node:diagnostics_channel';
import type { ClientRequest, IncomingMessage } from 'node:http';

import { getInstanceLogger } from '../logger.ts';

const logger = getInstanceLogger('OutgoingRequest');
let installed = false;

type UndiciRequest = { method: string; origin: string; path: string };

// request.path includes the query string. It is dropped so that secrets or user input passed as query
// parameters never end up in the logs, independent of how callers build their requests.
const stripQuery = (path: string) => path.split('?', 1)[0];

const httpUrl = (request: ClientRequest) => {
    const hostHeader = request.getHeader('host');
    const host = typeof hostHeader === 'string' ? hostHeader : request.host;
    return `${request.protocol}//${host}${stripQuery(request.path)}`;
};

const fetchUrl = (request: UndiciRequest) => `${request.origin}${stripQuery(request.path)}`;

const elapsedMs = (starts: WeakMap<object, number>, key: object) => {
    const start = starts.get(key);
    return start === undefined ? undefined : Math.round(performance.now() - start);
};

const logResponse = (method: string, url: string, status: number, durationMs: number | undefined) => {
    const message = `${method} ${url} ${status}`;
    const metadata = { method, url, status, durationMs };
    if (status >= 500) {
        logger.error(message, metadata);
    } else if (status >= 400) {
        logger.warn(message, metadata);
    } else {
        logger.debug(message, metadata);
    }
};

const logFailure = (method: string, url: string, error: Error, durationMs: number | undefined) => {
    logger.error(`${method} ${url} failed: ${error.message}`, { method, url, durationMs, error: error.message });
};

/**
 * Logs every outgoing HTTP request made by the website server (to the backend, LAPIS, Keycloak, ...),
 * using Node's built-in diagnostics channels. Covers node:http(s) (axios, Zodios, openid-client, ...)
 * and native fetch (undici) without patching any client.
 * Only scheme, host and path are logged, never the query string.
 * Successful calls are logged at debug, 4xx at warn, 5xx and network errors at error.
 */
export function installOutgoingRequestLogging() {
    if (installed) {
        return;
    }
    installed = true;

    const httpStarts = new WeakMap<object, number>();
    diagnosticsChannel.subscribe('http.client.request.start', (message) => {
        const { request } = message as { request: ClientRequest };
        httpStarts.set(request, performance.now());
    });
    diagnosticsChannel.subscribe('http.client.response.finish', (message) => {
        const { request, response } = message as { request: ClientRequest; response: IncomingMessage };
        logResponse(request.method, httpUrl(request), response.statusCode ?? 0, elapsedMs(httpStarts, request));
    });
    diagnosticsChannel.subscribe('http.client.request.error', (message) => {
        const { request, error } = message as { request: ClientRequest; error: Error };
        logFailure(request.method, httpUrl(request), error, elapsedMs(httpStarts, request));
    });

    const fetchStarts = new WeakMap<object, number>();
    diagnosticsChannel.subscribe('undici:request:create', (message) => {
        const { request } = message as { request: UndiciRequest };
        fetchStarts.set(request, performance.now());
    });
    diagnosticsChannel.subscribe('undici:request:headers', (message) => {
        const { request, response } = message as { request: UndiciRequest; response: { statusCode: number } };
        logResponse(request.method, fetchUrl(request), response.statusCode, elapsedMs(fetchStarts, request));
    });
    diagnosticsChannel.subscribe('undici:request:error', (message) => {
        const { request, error } = message as { request: UndiciRequest; error: Error };
        logFailure(request.method, fetchUrl(request), error, elapsedMs(fetchStarts, request));
    });
}
