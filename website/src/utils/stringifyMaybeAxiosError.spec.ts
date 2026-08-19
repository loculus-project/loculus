import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { describe, expect, test } from 'vitest';

import { stringifyMaybeAxiosError } from './stringifyMaybeAxiosError.ts';

const axiosErrorWithResponseData = (data: unknown, status = 500): AxiosError => {
    const config = { headers: new AxiosHeaders() };
    const response = {
        data,
        status,
        statusText: '',
        headers: new AxiosHeaders(),
        config,
    } as AxiosResponse;
    return new AxiosError(
        `Request failed with status code ${status}`,
        AxiosError.ERR_BAD_RESPONSE,
        config,
        {},
        response,
    );
};

describe('stringifyMaybeAxiosError', () => {
    test('returns the detail of a complete problem detail', () => {
        const error = axiosErrorWithResponseData({
            type: 'about:blank',
            title: 'Unprocessable Entity',
            status: 422,
            detail: "Invalid accession version format 'LOC_SS_1'",
            instance: '/west-nile/get-data-to-edit/LOC_SS_1/1',
        });

        expect(stringifyMaybeAxiosError(error)).toBe("Invalid accession version format 'LOC_SS_1'");
    });

    test('falls back to title and status when the problem detail has no detail member', () => {
        // Observed live: the backend omits `detail` when the underlying exception message is null.
        const error = axiosErrorWithResponseData({
            title: 'Internal Server Error',
            status: 500,
            instance: '/west-nile/get-data-to-edit/LOC_0001TLY/1',
        });

        const result = stringifyMaybeAxiosError(error);

        expect(result).not.toContain('undefined');
        expect(result).toBe('Internal Server Error (status 500)');
    });

    test('falls back to the error message when the response body carries nothing useful', () => {
        const error = axiosErrorWithResponseData({});

        const result = stringifyMaybeAxiosError(error);

        expect(result).not.toContain('undefined');
        expect(result).toBe('Request failed with status code 500');
    });

    test('reports when no response was received', () => {
        const error = new AxiosError('Network Error', AxiosError.ERR_NETWORK, undefined, {});

        expect(stringifyMaybeAxiosError(error)).toBe('Network Error; no response received');
    });

    test('returns the message of a plain error without surrounding quotes', () => {
        const result = stringifyMaybeAxiosError(new Error('something went wrong'));

        expect(result).toBe('something went wrong');
        expect(result).not.toContain('"');
    });
});
