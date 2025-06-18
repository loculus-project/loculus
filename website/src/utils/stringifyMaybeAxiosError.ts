import { type AxiosError } from 'axios';

import type { ProblemDetail } from '../types/backend.ts';

export const stringifyMaybeAxiosError = (error: unknown): string => {
    const axiosError = error as AxiosError;
    const data = axiosError.response?.data;

    // Handle structured API errors
    if (typeof data === 'object' && data !== null) {
        return (data as ProblemDetail).detail;
    }

    // Handle network errors (including CORS errors)
    if (axiosError.request && !axiosError.response) {
        // This typically indicates a network error such as:
        // - CORS errors (blocked by browser)
        // - Network connectivity issues
        // - Server not responding
        if (axiosError.code === 'ERR_NETWORK' || axiosError.message.includes('Network Error')) {
            return 'Network error: Unable to connect to the server. Please check your internet connection and ensure the server is accessible.';
        }

        // CORS-specific error detection
        if (
            axiosError.message.toLowerCase().includes('cors') ||
            axiosError.message.includes('Access-Control-Allow-Origin')
        ) {
            return 'CORS error: The server is not configured to accept requests from this origin. Please ensure the backend is properly configured for cross-origin requests.';
        }

        return `Network error: ${axiosError.message || 'Unable to reach the server'}`;
    }

    // Handle other errors
    return JSON.stringify((error as Error).message);
};
