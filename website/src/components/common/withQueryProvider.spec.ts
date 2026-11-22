import { describe, expect, test } from 'vitest';

import { retryOptions } from './withQueryProvider.tsx';
import { ApiError } from '../../services/apiRequest.ts';

const { retry } = retryOptions;

describe('retryOptions.retry', () => {
    test('does not retry errors that would fail again', () => {
        expect(retry(0, new ApiError('http', 'GET /x', { status: 400 }))).toBe(false);
        expect(retry(0, new ApiError('http', 'GET /x', { status: 404 }))).toBe(false);
        expect(retry(0, new ApiError('validation', 'GET /x', { status: 200 }))).toBe(false);
        expect(retry(0, new ApiError('aborted', 'GET /x'))).toBe(false);
        expect(retry(0, new Error('not a request error'))).toBe(false);
    });

    test('retries server and network errors up to 3 times', () => {
        for (const error of [new ApiError('http', 'GET /x', { status: 503 }), new ApiError('network', 'GET /x')]) {
            expect([0, 1, 2, 3].map((failureCount) => retry(failureCount, error))).toEqual([true, true, true, false]);
        }
    });
});
