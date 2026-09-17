import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, test } from 'vitest';

import { formatErrorMessage } from './formatErrorMessage.ts';

const BEARER = 'Bearer supersecrettoken';

function axiosErrorWithResponse(data: unknown) {
    const headers = new AxiosHeaders();
    headers.set('Authorization', BEARER);
    const config = { headers, url: '/west-nile/revise', method: 'post' };
    return new AxiosError(
        'Request failed with status code 422',
        'ERR_BAD_REQUEST',
        config,
        {},
        {
            status: 422,
            statusText: 'Unprocessable Content',
            headers,
            config,
            data,
        },
    );
}

describe('formatErrorMessage', () => {
    test('returns the backend detail', () => {
        const message = formatErrorMessage(axiosErrorWithResponse({ title: 'x', status: 422, detail: 'real' }));

        expect(message).toBe('real');
    });

    test('reads the detail off a bare problem detail object', () => {
        expect(formatErrorMessage({ title: 'x', status: 422, detail: 'real' })).toBe('real');
    });

    test('never exposes the authorization header when there is no detail', () => {
        const message = formatErrorMessage(axiosErrorWithResponse({ unexpected: 'shape' }));

        expect(message).not.toContain('supersecrettoken');
        expect(message).not.toContain('Authorization');
        expect(message).toContain('422');
    });

    test('does not return undefined for a response without a detail', () => {
        expect(typeof formatErrorMessage(axiosErrorWithResponse({}))).toBe('string');
    });
});
