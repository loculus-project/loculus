/**
 * Sends short LAPIS queries as GET with the query in the URL, and keeps POST with a JSON body for the rest.
 *
 * A GET is cacheable by the browser and needs no CORS preflight (unless it carries `If-None-Match`); the query engine
 * gives GET and POST the same body and the same ETag for the same parsed request. GET parameters are all strings, so a
 * request is only sent as GET when its URL encoding means exactly what its JSON means to both LAPIS and the engine:
 *  - arrays become repeated keys (filter values are never comma-split, so they may contain commas);
 *  - numbers and booleans become their string form;
 *  - `orderBy` must be ascending: GET has no way to say "descending" (LAPIS' GET only knows field names);
 *  - null values, empty arrays, nested objects, descending or `random` object orders keep the request on POST.
 */
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';

/**
 * Longest full URL sent as GET. LAPIS (Tomcat's default) rejects request lines plus headers over 8 KiB and the engine
 * over ~20 KB; 2000 stays well below both with room for the other headers, and below old proxy and log limits.
 */
export const LAPIS_GET_MAX_URL_LENGTH = 2000;

/** Parameters that a GET comma-splits and trims (LAPIS and the engine alike). */
const COMMA_SPLIT_KEYS = new Set(
    [
        'fields',
        'orderBy',
        'nucleotideMutations',
        'aminoAcidMutations',
        'nucleotideInsertions',
        'aminoAcidInsertions',
    ].map((key) => key.toLowerCase()),
);

/** Parameters parsed as integers; a fractional JSON number would be truncated by POST but rejected by GET. */
const INTEGER_KEYS = new Set(['limit', 'offset']);

function scalarToString(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? String(value) : undefined;
    }
    if (typeof value === 'boolean') {
        return String(value);
    }
    return undefined;
}

function orderByToString(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const { field, type, ...rest } = value as { field?: unknown; type?: unknown };
    if (typeof field !== 'string' || Object.keys(rest).length > 0) {
        return undefined;
    }
    return type === undefined || type === 'ascending' ? field : undefined;
}

/**
 * The URL query string (without `?`) meaning the same as this JSON request body, or undefined when GET can't express
 * it. Keys keep their order; array elements keep theirs.
 */
export function lapisRequestToQueryString(body: unknown): string | undefined {
    if (body === undefined || body === null) {
        return '';
    }
    if (typeof body !== 'object' || Array.isArray(body) || Object.getPrototypeOf(body) !== Object.prototype) {
        return undefined;
    }
    const pairs: string[] = [];
    for (const [key, rawValue] of Object.entries(body as Record<string, unknown>)) {
        if (rawValue === undefined) {
            continue; // JSON.stringify drops it too
        }
        const values = Array.isArray(rawValue) ? (rawValue as unknown[]) : [rawValue];
        if (values.length === 0) {
            return undefined; // POST: "must have at least one value" for filters; GET would drop the filter
        }
        const lowerKey = key.toLowerCase();
        for (const value of values) {
            const text = lowerKey === 'orderby' ? orderByToString(value) : scalarToString(value);
            if (text === undefined) {
                return undefined;
            }
            if (COMMA_SPLIT_KEYS.has(lowerKey) && (text.includes(',') || text.trim() !== text)) {
                return undefined;
            }
            if (INTEGER_KEYS.has(lowerKey) && typeof value === 'number' && !Number.isInteger(value)) {
                return undefined;
            }
            pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`);
        }
    }
    return pairs.join('&');
}

function hasParams(params: unknown): boolean {
    if (params === undefined || params === null) {
        return false;
    }
    if (params instanceof URLSearchParams) {
        return params.size > 0;
    }
    return typeof params !== 'object' || Object.keys(params).length > 0;
}

/**
 * Rewrites a POST with a plain-object JSON body into a GET when its full URL stays within `maxUrlLength`.
 * Anything else (other methods, streams, string/FormData bodies, existing query params) is left alone.
 */
export function toGetIfShort(
    config: InternalAxiosRequestConfig,
    maxUrlLength: number = LAPIS_GET_MAX_URL_LENGTH,
): InternalAxiosRequestConfig {
    if ((config.method ?? 'get').toLowerCase() !== 'post' || config.responseType === 'stream') {
        return config;
    }
    if (hasParams(config.params)) {
        return config;
    }
    const query = lapisRequestToQueryString(config.data);
    if (query === undefined) {
        return config;
    }
    const url = config.url ?? '';
    const getUrl = query === '' ? url : `${url}${url.includes('?') ? '&' : '?'}${query}`;
    const fullUrl = axios.getUri({ ...config, url: getUrl, params: undefined });
    if (fullUrl.length > maxUrlLength) {
        return config;
    }
    config.method = 'get';
    config.url = getUrl;
    config.data = undefined;
    config.headers.delete('Content-Type');
    return config;
}

/** Installs {@link toGetIfShort} on an axios instance used for LAPIS queries. */
export function sendShortLapisRequestsAsGet(instance: AxiosInstance, maxUrlLength = LAPIS_GET_MAX_URL_LENGTH) {
    instance.interceptors.request.use((config) => toGetIfShort(config, maxUrlLength));
}
