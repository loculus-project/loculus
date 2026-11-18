import { isAxiosError, type AxiosError } from 'axios';

import { isBackendApiError } from '../services/backend/backendApiClient.ts';
import type { ProblemDetail } from '../types/backend.ts';

export const stringifyMaybeAxiosError = (error: unknown): string => {
    if (isBackendApiError(error)) {
        return error.problemDetail.detail;
    }

    if (isAxiosError(error) && error.response === undefined && error.request !== undefined) {
        return `${error.message}; no response received`;
    }

    const data = (error as AxiosError).response?.data;
    if (typeof data === 'object' && data !== null) {
        return (data as ProblemDetail).detail;
    }

    return JSON.stringify((error as Error).message);
};
