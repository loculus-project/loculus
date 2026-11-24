import diagnosticsChannel from 'node:diagnostics_channel';
import type { ClientRequest, IncomingMessage } from 'node:http';

import { getInstanceLogger } from '../logger.ts';

/**
 * Request logging is opt-in via the LOG_REQUESTS=true environment variable.
 * It is read from process.env (not import.meta.env) so it can be toggled at runtime without rebuilding.
 */
export const isRequestLoggingEnabled = () => process.env.LOG_REQUESTS === 'true';

const logger = getInstanceLogger('outgoingRequest');
let installed = false;

type UndiciRequest = { method: string; origin: string; path: string };

const httpUrl = (request: ClientRequest) => {
    const hostHeader = request.getHeader('host');
    const host = typeof hostHeader === 'string' ? hostHeader : request.host;
    return `${request.protocol}//${host}${request.path}`;
};

const elapsedMs = (starts: WeakMap<object, number>, key: object) => {
    const start = starts.get(key);
    return start === undefined ? '?' : Math.round(performance.now() - start).toString();
};

/**
 * Logs every outgoing HTTP request made by the website server, using Node's built-in diagnostics channels.
 * Covers node:http(s) (axios, Zodios, openid-client, ...) and native fetch (undici) without patching any client.
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
        logger.info(
            `${request.method} ${httpUrl(request)} -> ${response.statusCode} (${elapsedMs(httpStarts, request)}ms)`,
        );
    });
    diagnosticsChannel.subscribe('http.client.request.error', (message) => {
        const { request, error } = message as { request: ClientRequest; error: Error };
        logger.error(
            `${request.method} ${httpUrl(request)} failed after ${elapsedMs(httpStarts, request)}ms: ${error.message}`,
        );
    });

    const fetchStarts = new WeakMap<object, number>();
    diagnosticsChannel.subscribe('undici:request:create', (message) => {
        const { request } = message as { request: UndiciRequest };
        fetchStarts.set(request, performance.now());
    });
    diagnosticsChannel.subscribe('undici:request:headers', (message) => {
        const { request, response } = message as { request: UndiciRequest; response: { statusCode: number } };
        logger.info(
            `${request.method} ${request.origin}${request.path} -> ${response.statusCode} (${elapsedMs(fetchStarts, request)}ms) [fetch]`,
        );
    });
    diagnosticsChannel.subscribe('undici:request:error', (message) => {
        const { request, error } = message as { request: UndiciRequest; error: Error };
        logger.error(
            `${request.method} ${request.origin}${request.path} failed after ${elapsedMs(fetchStarts, request)}ms: ${error.message} [fetch]`,
        );
    });

    logger.info('Outgoing request logging enabled');
}
