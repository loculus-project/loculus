import axios, { type AxiosResponse, isAxiosError, type Method } from 'axios';
import { z } from 'zod';

import { problemDetail, type ProblemDetail } from '../types/backend.ts';

type PathParam = string | number | undefined | null;

/**
 * Tagged template for building request paths. Every interpolated value is URL-encoded.
 * Throws if a value is missing or `NaN`, so that we never send a request to e.g. `/undefined/submit` or `/groups/NaN`.
 *
 * @example apiPath`/${organism}/get-data-to-edit/${accession}/${version}`
 */
export function apiPath(strings: TemplateStringsArray, ...values: PathParam[]): string {
    let path = strings[0];
    values.forEach((value, i) => {
        if (value === undefined || value === null || value === '') {
            throw new Error(`Missing path parameter #${i + 1} for path '${strings.join('{}')}'`);
        }
        if (Number.isNaN(value)) {
            throw new Error(`Path parameter #${i + 1} is NaN for path '${strings.join('{}')}'`);
        }
        path += encodeURIComponent(String(value)) + strings[i + 1];
    });
    return path;
}

export type ApiRequest = {
    method: Method;
    /** Path relative to the base URL. Use `apiPath` when it contains dynamic values. */
    path: string;
    /** Request body */
    data?: unknown;
    /** Query parameters; `undefined` values are omitted */
    params?: Record<string, unknown>;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    /** Defaults to JSON. With `'blob'`, an error response body is still parsed as JSON where possible. */
    responseType?: 'json' | 'text' | 'blob';
    /** In milliseconds; `0` means no timeout. Defaults to `defaultTimeout()`. */
    timeout?: number;
};

/** Server-side requests block rendering the page, so they must not hang forever when a service doesn't answer. */
export const SERVER_SIDE_TIMEOUT_MS = 30_000;

/**
 * Server-side requests time out after `SERVER_SIDE_TIMEOUT_MS`. Browser requests don't time out by default:
 * they include large uploads and downloads, and the user (or an `AbortSignal`) can cancel them.
 */
export function defaultTimeout(): number {
    return typeof window === 'undefined' ? SERVER_SIDE_TIMEOUT_MS : 0;
}

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'aborted' | 'validation';

/**
 * The only error `sendRequest` throws. It holds no headers, URLs, query strings or request bodies, so it is safe to log.
 * Its `message` is meant for users: the problem detail if there is one, else a short description.
 */
export class ApiError extends Error {
    override readonly name = 'ApiError';
    declare readonly status?: number;
    declare readonly problem?: ProblemDetail;
    declare readonly requestId?: string;
    declare readonly cause?: z.ZodError;

    constructor(
        readonly kind: ApiErrorKind,
        /** Method and path, e.g. `GET /groups/1` */
        readonly request: string,
        details: Pick<ApiError, 'status' | 'problem' | 'requestId' | 'cause'> = {},
    ) {
        const { problem, status } = details;
        super(problem !== undefined ? problem.detail || problem.title : kindMessage(kind, status));
        Object.assign(this, details);
    }

    get retryable(): boolean {
        if (this.kind === 'http') {
            return this.status === 429 || (this.status ?? 0) >= 500;
        }
        return this.kind === 'network' || this.kind === 'timeout';
    }
}

const kindMessages: Record<Exclude<ApiErrorKind, 'http'>, string> = {
    network: 'Network error, no response received',
    timeout: 'The request timed out',
    aborted: 'The request was cancelled',
    validation: 'Unexpected response from the server',
};

const kindMessage = (kind: ApiErrorKind, status?: number) =>
    kind === 'http' ? `Request failed with status code ${status}` : kindMessages[kind];

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

/**
 * Sends a request and validates the response body against `responseSchema`.
 * Without a `responseSchema` the response body is ignored.
 *
 * Throws an `ApiError` for every failure, including a response that doesn't match.
 */
export async function sendRequest<T>(
    baseUrl: string,
    request: ApiRequest & { responseSchema: z.ZodType<T> },
): Promise<T>;
export async function sendRequest(baseUrl: string, request: ApiRequest & { responseSchema?: undefined }): Promise<void>;
export async function sendRequest<T>(
    baseUrl: string,
    {
        method,
        path,
        data,
        params,
        headers,
        signal,
        responseType,
        timeout = defaultTimeout(),
        responseSchema,
    }: ApiRequest & { responseSchema?: z.ZodType<T> },
): Promise<T | void> {
    const requestName = `${method.toUpperCase()} ${path.split('?')[0]}`;
    let response: AxiosResponse<unknown>;
    try {
        response = await axios.request<unknown>({
            baseURL: baseUrl,
            url: path,
            method,
            data,
            params,
            headers,
            signal,
            responseType,
            timeout,
        });
    } catch (error) {
        throw await toApiError(error, requestName);
    }

    if (responseSchema === undefined) {
        return;
    }
    const parsed = responseSchema.safeParse(response.data);
    if (!parsed.success) {
        throw new ApiError('validation', requestName, { cause: parsed.error });
    }
    return parsed.data;
}

async function toApiError(error: unknown, request: string): Promise<ApiError> {
    if (axios.isCancel(error)) {
        return new ApiError('aborted', request);
    }
    if (!isAxiosError(error)) {
        throw error;
    }
    if (error.response === undefined) {
        const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
        return new ApiError(timedOut ? 'timeout' : 'network', request);
    }
    const { status, headers } = error.response;
    const data = await readBody(error.response.data);
    const header = (name: string) => (typeof headers[name] === 'string' ? headers[name] : undefined);
    const isText = typeof data === 'string' && !(header('content-type') ?? '').includes('html');
    const fallbackDetail = header('www-authenticate') ?? (isText ? data.trim().slice(0, 500) : '');
    const problem =
        parseProblem(data) ??
        (fallbackDetail !== ''
            ? { type: 'about:blank', title: kindMessage('http', status), status, detail: fallbackDetail }
            : undefined);
    return new ApiError('http', request, { status, problem, requestId: header('x-request-id') });
}

/** With `responseType: 'blob'`, axios also returns error bodies as a `Blob`. */
async function readBody(data: unknown): Promise<unknown> {
    if (!(data instanceof Blob)) {
        return data;
    }
    const text = await data.text();
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

/** Handles both the backend format (problem detail as the body) and the LAPIS format (wrapped in `error`). */
function parseProblem(data: unknown): ProblemDetail | undefined {
    const topLevel = problemDetail.safeParse(data);
    if (topLevel.success) {
        return topLevel.data;
    }
    const hasError = typeof data === 'object' && data !== null && 'error' in data;
    return hasError ? problemDetail.safeParse(data.error).data : undefined;
}

/**
 * A `responseSchema` that accepts any response without checking it, typed as `T`.
 * Only use it when validation is too expensive, e.g. for very large responses, and say why at the callsite.
 */
export const unvalidated = <T>(): z.ZodType<T> => z.custom<T>();

/**
 * Converts an object to multipart/form-data. Values that aren't files are converted to strings;
 * `undefined` and `null` values are skipped.
 */
export function toFormData(data: Record<string, unknown>): FormData {
    const formData = new FormData();
    Object.entries(data)
        .filter(([, value]) => value !== undefined && value !== null)
        .forEach(([key, value]) => formData.append(key, value instanceof Blob ? value : String(value)));
    return formData;
}

/** The HTTP status of a failed request, or `undefined` if there was no response. */
export function getErrorStatus(error: unknown): number | undefined {
    return isApiError(error) ? error.status : undefined;
}

/** Whether a failed request may succeed when retried: network errors, timeouts, HTTP 5xx and 429. */
export function isRetryable(error: unknown): boolean {
    return isApiError(error) && error.retryable;
}

/**
 * Turns any error thrown by `sendRequest` (or anything else) into a message that can be shown to the user.
 * Use it as `Failed to do X: ${getErrorMessage(error)}`.
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === 'string' ? error : 'Unknown error';
}
