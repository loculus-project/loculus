import axios, { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import {
    apiPath,
    extractProblemDetail,
    getErrorMessage,
    getErrorStatus,
    ResponseValidationError,
    sendRequest,
    SERVER_SIDE_TIMEOUT_MS,
} from './apiRequest.ts';
import type { ProblemDetail } from '../types/backend.ts';

const problemDetail: ProblemDetail = {
    type: 'about:blank',
    title: 'Unprocessable Content',
    status: 422,
    detail: 'Accession LOC_1 does not exist',
    instance: '/some/path',
};

function httpError(status: number, data: unknown) {
    const response = {
        status,
        statusText: '',
        data,
        headers: {},
        config: { headers: new AxiosHeaders() },
    } as AxiosResponse;
    return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', undefined, {}, response);
}

describe('apiPath', () => {
    test('URL-encodes the values', () => {
        expect(apiPath`/groups/${1}/users/${'a b/c'}`).toBe('/groups/1/users/a%20b%2Fc');
    });

    test('accepts 0', () => {
        expect(apiPath`/groups/${0}`).toBe('/groups/0');
    });

    test('throws for missing values', () => {
        expect(() => apiPath`/groups/${undefined}`).toThrow("Missing path parameter #1 for path '/groups/{}'");
        expect(() => apiPath`/groups/${null}`).toThrow('Missing path parameter #1');
        expect(() => apiPath`/${'org'}/groups/${''}`).toThrow('Missing path parameter #2');
    });

    test('throws for NaN', () => {
        expect(() => apiPath`/groups/${Number('abc')}`).toThrow("Path parameter #1 is NaN for path '/groups/{}'");
    });
});

describe('extractProblemDetail', () => {
    test('returns a top-level problem detail (backend format)', () => {
        expect(extractProblemDetail(httpError(422, problemDetail))).toEqual(problemDetail);
    });

    test('returns a problem detail wrapped in `error` (LAPIS format)', () => {
        expect(extractProblemDetail(httpError(400, { error: problemDetail, info: {} }))).toEqual(problemDetail);
    });

    test('returns undefined for other response bodies and errors', () => {
        expect(extractProblemDetail(httpError(503, { message: 'unavailable' }))).toBeUndefined();
        expect(extractProblemDetail(httpError(400, { error: { message: 'not a problem detail' } }))).toBeUndefined();
        expect(extractProblemDetail(new Error('boom'))).toBeUndefined();
    });
});

describe('getErrorMessage', () => {
    test('uses the problem detail from backend and LAPIS errors', () => {
        expect(getErrorMessage(httpError(422, problemDetail))).toBe(problemDetail.detail);
        expect(getErrorMessage(httpError(400, { error: problemDetail }))).toBe(problemDetail.detail);
    });

    test('falls back to the title when the detail is empty', () => {
        expect(getErrorMessage(httpError(422, { ...problemDetail, detail: '' }))).toBe(problemDetail.title);
    });

    test('uses the axios message for HTTP errors without a problem detail', () => {
        expect(getErrorMessage(httpError(503, 'Service Unavailable'))).toBe('Request failed with status code 503');
    });

    test('reports when no response was received', () => {
        const networkError = new AxiosError('Network Error', 'ERR_NETWORK', undefined, {});
        expect(getErrorMessage(networkError)).toBe('Network Error; no response received');
    });

    test('does not leak zod details for invalid responses', () => {
        const zodError = z.object({ a: z.string() }).safeParse({}).error!;
        const error = new ResponseValidationError('GET /foo', zodError);
        expect(getErrorMessage(error)).toBe('Unexpected response from GET /foo');
    });

    test('handles other errors and values', () => {
        expect(getErrorMessage(new Error('boom'))).toBe('boom');
        expect(getErrorMessage('plain string')).toBe('plain string');
        expect(getErrorMessage({ some: 'object' })).toBe('Unknown error');
    });
});

describe('getErrorStatus', () => {
    test('returns the status of an HTTP error response', () => {
        expect(getErrorStatus(httpError(503, {}))).toBe(503);
    });

    test('returns undefined for errors without a response', () => {
        expect(getErrorStatus(new AxiosError('Network Error'))).toBeUndefined();
        expect(getErrorStatus(new Error('boom'))).toBeUndefined();
    });
});

describe('sendRequest timeout', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    const mockAxios = () => vi.spyOn(axios, 'request').mockResolvedValue({ data: undefined });

    test('does not time out in the browser by default', async () => {
        const spy = mockAxios();
        await sendRequest('http://service', { method: 'get', path: '/' });
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ timeout: 0 }));
    });

    test('times out server-side by default', async () => {
        vi.stubGlobal('window', undefined);
        const spy = mockAxios();
        await sendRequest('http://service', { method: 'get', path: '/' });
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ timeout: SERVER_SIDE_TIMEOUT_MS }));
    });

    test('uses an explicit timeout', async () => {
        vi.stubGlobal('window', undefined);
        const spy = mockAxios();
        await sendRequest('http://service', { method: 'get', path: '/', timeout: 0 });
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ timeout: 0 }));
    });
});
