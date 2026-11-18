import createClient, { type Client } from 'openapi-fetch';
import type { z } from 'zod';

import type { paths } from './openapi';
import { problemDetail, type ProblemDetail } from '../../types/backend.ts';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';

/**
 * Typed client for the Loculus backend.
 *
 * Paths, parameters, request bodies and responses are typed by `./openapi.d.ts`, which is generated from the
 * backend's OpenAPI spec. Regenerate it with `npm run generate-backend-api` whenever the backend API changes.
 *
 * Responses are not validated at runtime by default: the types are generated from the backend itself, so they can't
 * drift as long as the spec is regenerated when the backend changes (CI checks that it is).
 * Pass a zod schema to {@link unwrapBackendResponse} where the spec is too loose to be useful,
 * e.g. metadata maps, which the spec types as `unknown`.
 */
export type BackendApiClient = Client<paths>;

export function createBackendApiClient(baseUrl: string, accessToken?: string): BackendApiClient {
    return createClient<paths>({ baseUrl, headers: createAuthorizationHeader(accessToken) });
}

/**
 * The one error type thrown (or returned in a `Result`) for failed backend requests,
 * whether the backend answered with an error status or the request never got a response.
 */
export class BackendApiError extends Error {
    /**
     * @param problemDetail What went wrong. Synthesized when the backend didn't send one.
     * @param isFromBackend Whether `problemDetail` is the backend's own error response, as opposed to a network error,
     *      an unexpected error body or a response that failed validation.
     * @param cause The underlying error, if any.
     */
    constructor(
        public readonly problemDetail: ProblemDetail,
        public readonly isFromBackend: boolean,
        public readonly cause?: unknown,
    ) {
        super(problemDetail.detail);
        this.name = 'BackendApiError';
    }

    public get status() {
        return this.problemDetail.status;
    }
}

export const isBackendApiError = (error: unknown): error is BackendApiError => error instanceof BackendApiError;

export type FetchResult<T> = { data?: T; error?: unknown; response: Response };

/**
 * Awaits an openapi-fetch call and returns its data, or throws a {@link BackendApiError}.
 * With a `responseSchema`, the data is also validated (and typed) with it.
 */
export async function unwrapBackendResponse<T>(request: Promise<FetchResult<T>>): Promise<T>;
export async function unwrapBackendResponse<S extends z.ZodTypeAny>(
    request: Promise<FetchResult<unknown>>,
    responseSchema: S,
): Promise<z.infer<S>>;
export async function unwrapBackendResponse(
    request: Promise<FetchResult<unknown>>,
    responseSchema?: z.ZodTypeAny,
): Promise<unknown> {
    let result: FetchResult<unknown>;
    try {
        result = await request;
    } catch (error) {
        throw new BackendApiError(
            {
                type: 'about:blank',
                title: 'bad response',
                status: 0,
                detail: `Failed to make request: ${error instanceof Error ? error.message : String(error)}`,
            },
            false,
            error,
        );
    }

    const { data, error, response } = result;
    if (!response.ok) {
        const parsedProblemDetail = problemDetail.safeParse(error);
        throw parsedProblemDetail.success
            ? new BackendApiError(parsedProblemDetail.data, true)
            : new BackendApiError(fallbackProblemDetail(response), false, error);
    }
    if (responseSchema === undefined) {
        return data;
    }

    const parsed = responseSchema.safeParse(data);
    if (!parsed.success) {
        throw new BackendApiError(
            {
                type: 'about:blank',
                title: 'bad response',
                status: 0,
                detail: `Failed to parse backend response: ${parsed.error.toString()}`,
            },
            false,
            parsed.error,
        );
    }
    return parsed.data as unknown;
}

function fallbackProblemDetail(response: Response): ProblemDetail {
    if (response.status === 401) {
        return {
            type: 'about:blank',
            title: 'Not authorized',
            status: 401,
            detail: response.headers.get('www-authenticate') ?? 'Not authorized',
        };
    }

    return {
        type: 'about:blank',
        title: 'bad response',
        status: response.status,
        detail: `Failed to make request: Request failed with status code ${response.status}`,
    };
}
