import { isAxiosError, type AxiosError } from 'axios';

const problemDetailOf = (value: unknown): string | undefined => {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }
    const detail = (value as { detail?: unknown }).detail;
    return typeof detail === 'string' ? detail : undefined;
};

/**
 * Turns an unknown error into a message safe to show a user or write to a log.
 *
 * Never stringify an AxiosError directly: its toJSON() serialises the request config, so the
 * dump carries the Authorization header while omitting the backend's message entirely.
 */
export const formatErrorMessage = (error: unknown): string => {
    if (isAxiosError(error) && error.response === undefined && error.request !== undefined) {
        return `${error.message}; no response received`;
    }

    const detail = problemDetailOf((error as AxiosError).response?.data) ?? problemDetailOf(error);
    if (detail !== undefined) {
        return detail;
    }

    if (isAxiosError(error)) {
        const status = error.response?.status;
        return status !== undefined ? `${error.message} (status ${status})` : error.message;
    }

    return error instanceof Error ? error.message : String(error);
};
