import { isAxiosError, type AxiosError } from 'axios';

import { problemDetail, type ProblemDetail } from '../types/backend.ts';

const UNKNOWN_STATUS = 0;

const looseDetailOf = (value: unknown): string | undefined => {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }
    const detail = (value as { detail?: unknown }).detail;
    return typeof detail === 'string' ? detail : undefined;
};

const fallbackDetail = (error: unknown): string => {
    if (isAxiosError(error)) {
        if (error.response === undefined && error.request !== undefined) {
            return `${error.message}; no response received`;
        }
        return error.message;
    }
    return error instanceof Error ? error.message : String(error);
};

/**
 * Converts an unknown error into a ProblemDetail, so callers can switch on `status` and show
 * `detail` without ever touching the axios error. A `status` of 0 means the failure produced no
 * HTTP response. LAPIS nests its problem detail under `error`, so both shapes are tried.
 *
 * Never stringify an AxiosError instead: its toJSON() serialises the request config, so the dump
 * carries the Authorization header while omitting the backend's message entirely.
 */
/**
 * The problem detail a response carried, or undefined if it carried none. LAPIS nests its problem
 * detail under `error`, so both shapes are tried.
 */
export const problemDetailFromResponse = (error: unknown): ProblemDetail | undefined => {
    const responseData = (error as AxiosError | null | undefined)?.response?.data;
    const nested =
        typeof responseData === 'object' && responseData !== null
            ? (responseData as { error?: unknown }).error
            : undefined;

    for (const candidate of [nested, responseData]) {
        const parsed = problemDetail.safeParse(candidate);
        if (parsed.success) {
            return parsed.data;
        }
    }
    return undefined;
};

/**
 * Converts an unknown error into a ProblemDetail, so callers can switch on `status` and show
 * `detail` without ever touching the axios error. A `status` of 0 means the failure produced no
 * HTTP response.
 *
 * Never stringify an AxiosError instead: its toJSON() serialises the request config, so the dump
 * carries the Authorization header while omitting the backend's message entirely.
 */
export const asProblemDetail = (error: unknown): ProblemDetail => {
    const fromResponse = problemDetailFromResponse(error);
    if (fromResponse !== undefined) {
        return fromResponse;
    }

    const responseData = (error as AxiosError | null | undefined)?.response?.data;
    const detail = looseDetailOf(responseData) ?? looseDetailOf(error);
    const status = isAxiosError(error) ? (error.response?.status ?? UNKNOWN_STATUS) : UNKNOWN_STATUS;

    return {
        type: 'about:blank',
        title: error instanceof Error ? error.message : 'Unknown error',
        status,
        detail: detail ?? fallbackDetail(error),
    };
};

/**
 * The message to show a user or write to a log for an arbitrary error.
 */
export const formatErrorMessage = (error: unknown): string => asProblemDetail(error).detail;
