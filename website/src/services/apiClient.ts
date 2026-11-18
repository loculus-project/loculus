import axios, { type AxiosError, type AxiosResponse, isAxiosError } from 'axios';
import type { z } from 'zod';

import { problemDetail, type ProblemDetail } from '../types/backend.ts';

/**
 * A minimal, typed description of an HTTP endpoint.
 *
 * - `path` may contain path parameters in the form `:name` (also inside a query string, e.g. `?id=:id`).
 * - `body` is validated before the request is sent.
 * - `response` is validated if the server answers with a JSON content type.
 */
export type ApiEndpoint = {
    method: 'get' | 'post' | 'put' | 'delete';
    path: string;
    body?: z.ZodTypeAny;
    queries?: z.ZodTypeAny;
    response: z.ZodTypeAny;
    requestFormat?: 'json' | 'form-data';
};

export type ApiDefinition = Record<string, ApiEndpoint>;

type ParamName<S extends string> = S extends `${infer Name}/${string}`
    ? Name
    : S extends `${infer Name}?${string}`
      ? Name
      : S extends `${infer Name}&${string}`
        ? Name
        : S;

export type PathParamNames<Path extends string> = Path extends `${string}:${infer Rest}`
    ? ParamName<Rest> | PathParamNames<Rest>
    : never;

type PathParamsConfig<E extends ApiEndpoint> = [PathParamNames<E['path']>] extends [never]
    ? { params?: undefined }
    : { params: Record<PathParamNames<E['path']>, string | number> };

type QueriesConfig<E extends ApiEndpoint> = E extends { queries: infer Q extends z.ZodTypeAny }
    ? { queries?: z.input<Q> }
    : { queries?: undefined };

export type RequestConfig<E extends ApiEndpoint> = PathParamsConfig<E> &
    QueriesConfig<E> & {
        headers?: Record<string, string>;
        signal?: AbortSignal;
    };

export type RequestBody<E extends ApiEndpoint> = E extends { body: infer B extends z.ZodTypeAny }
    ? z.input<B>
    : undefined;

export type RequestArgs<E extends ApiEndpoint> = RequestConfig<E> &
    (E extends { body: z.ZodTypeAny } ? { body: RequestBody<E> } : { body?: undefined });

export type ApiResponse<E extends ApiEndpoint> = z.output<E['response']>;

type UntypedRequestArgs = {
    params?: Record<string, string | number>;
    queries?: Record<string, unknown>;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    body?: unknown;
};

export class ApiValidationError extends Error {
    constructor(
        message: string,
        public readonly data: unknown,
        public readonly zodError: z.ZodError,
    ) {
        super(message);
        this.name = 'ApiValidationError';
    }
}

export type ApiClientOptions = {
    /**
     * If true (default), the validated (and potentially transformed) data is sent / returned.
     * If false, the data is only validated, but the original data is sent / returned.
     */
    transform?: boolean;
};

const PATH_PARAM_REGEX = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;

export function buildPath(path: string, params: Record<string, string | number> | undefined) {
    if (params === undefined) {
        return path;
    }
    return path.replace(PATH_PARAM_REGEX, (match, name: string) =>
        name in params ? encodeURIComponent(String(params[name])) : match,
    );
}

function toFormData(body: unknown) {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new Error('multipart/form-data body must be an object');
    }
    const formData = new FormData();
    for (const [key, value] of Object.entries(body)) {
        formData.append(key, value instanceof Blob ? value : String(value));
    }
    return formData;
}

function isJsonResponse(response: AxiosResponse) {
    const contentType: unknown = response.headers['content-type'];
    return (
        typeof contentType === 'string' &&
        (contentType.includes('application/json') || contentType.includes('application/vnd.api+json'))
    );
}

export class ApiClient<Api extends ApiDefinition> {
    constructor(
        public readonly baseUrl: string,
        private readonly api: Api,
        private readonly options: ApiClientOptions = {},
    ) {}

    /**
     * Sends a request to the endpoint `alias`. Throws an AxiosError on HTTP errors
     * and an ApiValidationError if the request body or the response doesn't match the schema.
     */
    public async request<Alias extends keyof Api & string>(
        alias: Alias,
        args: RequestArgs<Api[Alias]>,
    ): Promise<ApiResponse<Api[Alias]>> {
        const endpoint = this.api[alias];
        const { params, queries, headers, signal, body } = args as UntypedRequestArgs;
        const transform = this.options.transform ?? true;

        let data = body;
        if (endpoint.body !== undefined && body !== undefined) {
            const parsed = await endpoint.body.safeParseAsync(body);
            if (!parsed.success) {
                throw new ApiValidationError(`Invalid request body for '${alias}'`, body, parsed.error);
            }
            if (transform) {
                data = parsed.data;
            }
        }

        const response = await axios.request<unknown>({
            baseURL: this.baseUrl,
            url: buildPath(endpoint.path, params),
            method: endpoint.method,
            params: queries,
            headers,
            signal,
            data: endpoint.requestFormat === 'form-data' ? toFormData(data) : data,
        });

        if (!isJsonResponse(response)) {
            return response.data;
        }

        const parsed = await endpoint.response.safeParseAsync(response.data);
        if (!parsed.success) {
            throw new ApiValidationError(
                `Invalid response from endpoint '${endpoint.method} ${endpoint.path}' (status ${response.status}): ${parsed.error.message}`,
                response.data,
                parsed.error,
            );
        }
        return (transform ? parsed.data : response.data) as ApiResponse<Api[Alias]>;
    }
}

export type ProblemDetailAxiosError = AxiosError<ProblemDetail> & { response: AxiosResponse<ProblemDetail> };

/**
 * Checks whether the error is an HTTP error whose response body is a problem detail.
 */
export function isProblemDetailError(error: unknown): error is ProblemDetailAxiosError {
    return isAxiosError(error) && error.response !== undefined && problemDetail.safeParse(error.response.data).success;
}
