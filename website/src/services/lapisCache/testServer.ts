/* eslint-disable @typescript-eslint/naming-convention -- HTTP header and environment variable names */
import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';

export type FakeReply = { status: number; headers?: Record<string, string | undefined>; body?: string };

export type FakeRequest = { method: string; url: string; ifNoneMatch: string | undefined; data: unknown };

/** A stand-in for axios' network adapter that settles exactly like it does (rejects on `validateStatus`). */
export function fakeLapis(handler: (request: FakeRequest) => FakeReply) {
    const requests: FakeRequest[] = [];
    const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) => {
        const headers = AxiosHeaders.from(config.headers);
        const ifNoneMatch = headers.get('If-None-Match');
        const request = {
            method: config.method ?? 'get',
            url: `${config.baseURL ?? ''}${config.url ?? ''}`,
            ifNoneMatch: typeof ifNoneMatch === 'string' ? ifNoneMatch : undefined,
            data: config.data as unknown,
        };
        requests.push(request);
        const reply = handler(request);
        const response = {
            data: reply.body ?? '',
            status: reply.status,
            statusText: String(reply.status),
            headers: new AxiosHeaders(
                Object.fromEntries(
                    Object.entries(reply.headers ?? {}).filter(
                        (entry): entry is [string, string] => entry[1] !== undefined,
                    ),
                ),
            ),
            config,
            request: {},
        };
        if (config.validateStatus && !config.validateStatus(reply.status)) {
            return Promise.reject(
                new AxiosError(
                    `Request failed with status code ${reply.status}`,
                    'ERR_BAD_RESPONSE',
                    config,
                    {},
                    response,
                ),
            );
        }
        return Promise.resolve(response);
    };
    return { adapter, requests };
}

/** The server parses the body, so key order does not change its ETag. */
const canonicalJson = (data: unknown) =>
    typeof data === 'string' && data !== ''
        ? JSON.stringify(JSON.parse(data), (_key, value: unknown) =>
              value !== null && typeof value === 'object' && !Array.isArray(value)
                  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
                  : value,
          )
        : '';

/** Replies like the query engine: an ETag per (url, body, version), 304 when `If-None-Match` matches. */
export function etagServer(state: { version: number; bodyFor?: (request: FakeRequest) => string }) {
    return fakeLapis((request) => {
        const etag = `W/"${state.version}-${request.url}-${canonicalJson(request.data)}"`;
        if (request.ifNoneMatch === etag) {
            return { status: 304, headers: { etag, 'cache-control': 'no-cache' } };
        }
        const body = state.bodyFor?.(request) ?? JSON.stringify({ data: [{ version: state.version }] });
        return {
            status: 200,
            headers: { etag, 'cache-control': 'no-cache', 'content-type': 'application/json' },
            body,
        };
    });
}
