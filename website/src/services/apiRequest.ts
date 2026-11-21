import { isAxiosError } from 'axios';

import { problemDetail, type ProblemDetail } from '../types/backend.ts';

/**
 * Returns the problem detail from an HTTP error response, if there is one.
 * Handles both the backend format (problem detail as the body) and the LAPIS format (wrapped in `error`).
 */
export function extractProblemDetail(error: unknown): ProblemDetail | undefined {
    if (!isAxiosError(error) || error.response === undefined) {
        return undefined;
    }
    const data: unknown = error.response.data;

    const topLevel = problemDetail.safeParse(data);
    if (topLevel.success) {
        return topLevel.data;
    }

    if (typeof data === 'object' && data !== null && 'error' in data) {
        const nested = problemDetail.safeParse(data.error);
        if (nested.success) {
            return nested.data;
        }
    }
    return undefined;
}

/**
 * Returns the HTTP status code of an error response, or `undefined` if the error isn't an HTTP error response
 * (e.g. a network error or a `ResponseValidationError`). Use this instead of inspecting axios errors in components.
 */
export function getErrorStatus(error: unknown): number | undefined {
    return isAxiosError(error) ? error.response?.status : undefined;
}

/**
 * Turns any error from a request (or anything else) into a message that can be shown to the user.
 * Use it as `Failed to do X: ${getErrorMessage(error)}`.
 */
export function getErrorMessage(error: unknown): string {
    const problem = extractProblemDetail(error);
    if (problem !== undefined) {
        return problem.detail !== '' ? problem.detail : problem.title;
    }
    if (isAxiosError(error)) {
        return error.response === undefined ? `${error.message}; no response received` : error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'Unknown error';
}
