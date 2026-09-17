import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, test } from 'vitest';

import { asProblemDetail, formatErrorMessage, problemDetailFromResponse } from './formatErrorMessage.ts';

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

    test('exposes the status to switch on alongside the message', () => {
        const problem = asProblemDetail(axiosErrorWithResponse({ title: 'x', status: 422, detail: 'real' }));

        expect(problem.status).toBe(422);
        expect(problem.detail).toBe('real');
    });

    test('unwraps the problem detail LAPIS nests under error', () => {
        const problem = asProblemDetail(
            axiosErrorWithResponse({ error: { title: 'x', status: 400, detail: 'lapis said no' } }),
        );

        expect(problem.detail).toBe('lapis said no');
        expect(problem.status).toBe(400);
    });

    test('reports status 0 when the failure produced no response', () => {
        const problem = asProblemDetail(new Error('boom'));

        expect(problem.status).toBe(0);
        expect(problem.detail).toBe('boom');
    });

    test.each([null, undefined, 'a string', 42])('survives %p', (value) => {
        expect(problemDetailFromResponse(value)).toBeUndefined();
        expect(typeof formatErrorMessage(value)).toBe('string');
        expect(asProblemDetail(value).status).toBe(0);
    });
});
