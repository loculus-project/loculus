import { type AxiosError } from 'axios';

import type { ProblemDetail } from '../types/backend.ts';

export const stringifyMaybeAxiosError = (error: unknown): string => {
    const data = (error as AxiosError).response?.data;
    if (typeof data === 'object' && data !== null) {
        return (data as ProblemDetail).detail;
    }

    return JSON.stringify((error as Error).message);
};
