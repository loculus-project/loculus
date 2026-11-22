import { inspect } from 'node:util';

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import {
    ApiError,
    apiPath,
    getErrorMessage,
    getErrorStatus,
    isRetryable,
    sendRequest,
    SERVER_SIDE_TIMEOUT_MS,
    toFormData,
} from './apiRequest.ts';
import { testServer } from '../../vitest.setup.ts';
import type { ProblemDetail } from '../types/backend.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

const problemDetail: ProblemDetail = {
    type: 'about:blank',
    title: 'Unprocessable Content',
    status: 422,
    detail: 'Accession LOC_1 does not exist',
    instance: '/some/path',
};

const baseUrl = 'http://service.example';
const token = 'secret-token-123';

const catchApiError = (promise: Promise<unknown>) =>
    promise.then(
        () => expect.unreachable(),
        (error: unknown) => error as ApiError,
    );

function failedRequest(response?: () => Response | Promise<Response>) {
    if (response) {
        testServer.use(http.get(`${baseUrl}/groups/1`, response));
    }
    const request = { params: { token }, headers: createAuthorizationHeader(token) };
    return catchApiError(sendRequest(baseUrl, { method: 'get', path: '/groups/1', ...request }));
}

/** The timeout of happy-dom's XMLHttpRequest doesn't fire, so simulate the error axios throws. */
function timedOutRequest() {
    vi.spyOn(axios, 'request').mockImplementationOnce((config) =>
        Promise.reject(
            new AxiosError('timeout of 10ms exceeded', 'ECONNABORTED', config as InternalAxiosRequestConfig),
        ),
    );
    return failedRequest();
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

describe('sendRequest errors', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('reads a problem detail (backend format)', async () => {
        const error = await failedRequest(() => Response.json(problemDetail, { status: 422 }));
        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ kind: 'http', request: 'GET /groups/1', status: 422, problem: problemDetail });
        expect(getErrorMessage(error)).toBe(problemDetail.detail);
        expect(getErrorStatus(error)).toBe(422);
    });

    test('reads a problem detail wrapped in `error` (LAPIS format)', async () => {
        const error = await failedRequest(() => Response.json({ error: problemDetail, info: {} }, { status: 400 }));
        expect(error.problem).toEqual(problemDetail);
    });

    test('falls back to the title when the detail is empty', async () => {
        const error = await failedRequest(() => Response.json({ ...problemDetail, detail: '' }, { status: 422 }));
        expect(getErrorMessage(error)).toBe(problemDetail.title);
    });

    test('reads a problem detail from a blob response', async () => {
        testServer.use(http.get(`${baseUrl}/file`, () => Response.json(problemDetail, { status: 422 })));
        const error = await sendRequest(baseUrl, { method: 'get', path: '/file', responseType: 'blob' }).catch(
            (error: unknown) => error,
        );
        expect(getErrorMessage(error)).toBe(problemDetail.detail);
    });

    test('uses the WWW-Authenticate header or a text body when there is no problem detail', async () => {
        const unauthorized = await failedRequest(
            () => new Response(null, { status: 401, headers: [['WWW-Authenticate', 'Bearer error="invalid_token"']] }),
        );
        expect(unauthorized.problem).toMatchObject({ status: 401, detail: 'Bearer error="invalid_token"' });

        const textError = await failedRequest(() => new Response(`Bad Gateway${'x'.repeat(1000)}`, { status: 502 }));
        expect(getErrorMessage(textError)).toMatch(/^Bad Gateway/);
        expect(getErrorMessage(textError)).toHaveLength(500);
    });

    test('reports the status when there is no readable body', async () => {
        const error = await failedRequest(() =>
            Response.json({ message: 'unavailable' }, { status: 503, headers: [['x-request-id', 'req-1']] }),
        );
        expect(error).toMatchObject({ kind: 'http', status: 503, problem: undefined, requestId: 'req-1' });
        expect(getErrorMessage(error)).toBe('Request failed with status code 503');
    });

    test('distinguishes network errors, timeouts and cancelled requests', async () => {
        expect(await failedRequest(() => HttpResponse.error())).toMatchObject({ kind: 'network' });
        expect(await timedOutRequest()).toMatchObject({ kind: 'timeout' });

        const aborted = sendRequest(baseUrl, { method: 'get', path: '/slow', signal: AbortSignal.abort() });
        await expect(aborted).rejects.toMatchObject({ kind: 'aborted' });
    });

    test('never contains the token, the query string or headers', async () => {
        const errors = [
            await failedRequest(() => Response.json(problemDetail, { status: 422 })),
            await failedRequest(() => HttpResponse.error()),
            await timedOutRequest(),
        ];
        expect(errors.map((error) => error.kind)).toEqual(['http', 'network', 'timeout']);
        for (const error of errors) {
            expect(JSON.stringify(error)).not.toContain(token);
            expect(inspect(error, { depth: Infinity, showHidden: true })).not.toContain(token);
            expect(error.request).toBe('GET /groups/1');
        }
    });

    test('rejects responses that do not match the schema without leaking the payload', async () => {
        testServer.use(http.get(`${baseUrl}/groups/1`, () => Response.json({ a: 'secret-payload' })));
        const error = await catchApiError(
            sendRequest(baseUrl, { method: 'get', path: '/groups/1', responseSchema: z.object({ a: z.number() }) }),
        );
        expect(error).toMatchObject({ kind: 'validation', request: 'GET /groups/1' });
        expect(error.cause).toBeInstanceOf(z.ZodError);
        expect(getErrorMessage(error)).toBe('Unexpected response from the server');
        expect(error.message).not.toContain('secret-payload');
    });
});

describe('isRetryable', () => {
    test.each([
        [new ApiError('network', 'GET /'), true],
        [new ApiError('timeout', 'GET /'), true],
        [new ApiError('http', 'GET /', { status: 503 }), true],
        [new ApiError('http', 'GET /', { status: 429 }), true],
        [new ApiError('http', 'GET /', { status: 404 }), false],
        [new ApiError('validation', 'GET /'), false],
        [new ApiError('aborted', 'GET /'), false],
        [new Error('boom'), false],
    ])('%s -> %s', (error, expected) => {
        expect(isRetryable(error)).toBe(expected);
    });
});

describe('getErrorMessage', () => {
    test('handles other errors and values', () => {
        expect(getErrorMessage(new Error('boom'))).toBe('boom');
        expect(getErrorMessage('plain string')).toBe('plain string');
        expect(getErrorMessage({ some: 'object' })).toBe('Unknown error');
        expect(getErrorStatus(new Error('boom'))).toBeUndefined();
    });
});

describe('toFormData', () => {
    test('skips undefined and null values', () => {
        const file = new Blob(['a']);
        const formData = toFormData({ file, groupId: 1, empty: undefined, none: null });
        expect([...formData.keys()]).toEqual(['file', 'groupId']);
        expect(formData.get('groupId')).toBe('1');
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
