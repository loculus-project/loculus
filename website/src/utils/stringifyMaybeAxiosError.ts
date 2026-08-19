import { isAxiosError, type AxiosError } from 'axios';

import type { ProblemDetail } from '../types/backend.ts';

export const stringifyMaybeAxiosError = (error: unknown): string => {
    if (isAxiosError(error) && error.response === undefined && error.request !== undefined) {
        return `${error.message}; no response received`;
    }

    const data = (error as AxiosError | undefined)?.response?.data;
    if (typeof data === 'object' && data !== null) {
        // The backend omits members of the problem detail whose value is null,
        // so `detail` (and even `title`) may be absent.
        const { detail, title, status } = data as Partial<ProblemDetail>;
        if (typeof detail === 'string' && detail !== '') {
            return detail;
        }
        if (typeof title === 'string' && title !== '') {
            return typeof status === 'number' ? `${title} (status ${status})` : title;
        }
    }

    const message = (error as Error | undefined)?.message;
    if (typeof message === 'string' && message !== '') {
        return message;
    }
    if (typeof error === 'string' && error !== '') {
        return error;
    }
    return 'An unknown error occurred';
};
