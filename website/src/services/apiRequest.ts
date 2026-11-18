import axios, { type AxiosError, type AxiosResponse, isAxiosError, type Method } from 'axios';
import type { z } from 'zod';

import { problemDetail, type ProblemDetail } from '../types/backend.ts';

type PathParam = string | number | undefined | null;

/**
 * Tagged template for building request paths. Every interpolated value is URL-encoded.
 * Throws if a value is missing, so that we never send a request to e.g. `/undefined/submit`.
 *
 * @example apiPath`/${organism}/get-data-to-edit/${accession}/${version}`
 */
export function apiPath(strings: TemplateStringsArray, ...values: PathParam[]): string {
    let path = strings[0];
    values.forEach((value, i) => {
        if (value === undefined || value === null || value === '') {
            throw new Error(`Missing path parameter #${i + 1} for path '${strings.join('{}')}'`);
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
};

/**
 * Thrown when the server responds successfully, but the response body doesn't match the expected schema.
 */
export class ResponseValidationError extends Error {
    constructor(
        public readonly request: string,
        public readonly zodError: z.ZodError,
    ) {
        super(`Unexpected response from ${request}: ${zodError.message}`);
        this.name = 'ResponseValidationError';
    }
}

/**
 * Sends a request and validates the response body against `responseSchema`.
 * Without a `responseSchema` the response body is ignored.
 *
 * Throws an `AxiosError` on HTTP/network errors and a `ResponseValidationError` if the response doesn't match.
 */
export async function sendRequest<T>(
    baseUrl: string,
    request: ApiRequest & { responseSchema: z.ZodType<T> },
): Promise<T>;
export async function sendRequest(baseUrl: string, request: ApiRequest & { responseSchema?: undefined }): Promise<void>;
export async function sendRequest<T>(
    baseUrl: string,
    { method, path, data, params, headers, signal, responseSchema }: ApiRequest & { responseSchema?: z.ZodType<T> },
): Promise<T | void> {
    const response = await axios.request<unknown>({
        baseURL: baseUrl,
        url: path,
        method,
        data,
        params,
        headers,
        signal,
    });

    if (responseSchema === undefined) {
        return;
    }
    const parsed = responseSchema.safeParse(response.data);
    if (!parsed.success) {
        throw new ResponseValidationError(`${method.toUpperCase()} ${path}`, parsed.error);
    }
    return parsed.data;
}

/**
 * Converts an object to multipart/form-data. Values that aren't files are converted to strings.
 */
export function toFormData(data: Record<string, unknown>): FormData {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
        formData.append(key, value instanceof Blob ? value : String(value));
    }
    return formData;
}

export type ProblemDetailAxiosError = AxiosError<ProblemDetail> & { response: AxiosResponse<ProblemDetail> };

/**
 * Checks whether the error is an HTTP error whose response body is a problem detail.
 */
export function isProblemDetailError(error: unknown): error is ProblemDetailAxiosError {
    return isAxiosError(error) && error.response !== undefined && problemDetail.safeParse(error.response.data).success;
}
