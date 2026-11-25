import type { APIContext } from 'astro';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    error: vi.fn(),
}));

vi.mock('../logger.ts', () => ({
    getInstanceLogger: () => ({
        debug: vi.fn(),
        error: mocks.error,
        info: vi.fn(),
        warn: vi.fn(),
    }),
}));

import { catchErrorMiddleware } from './catchErrorMiddleware.ts';

describe('catchErrorMiddleware', () => {
    const redirectResponse = new Response(null, { status: 302, headers: { location: '/500' } });
    const redirect = vi.fn(() => redirectResponse);
    const context = {
        request: new Request('https://loculus.test/ebola-zaire/search'),
        url: new URL('https://loculus.test/ebola-zaire/search'),
        params: { organism: 'ebola-zaire' },
        redirect,
    } as unknown as APIContext;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('passes the response through and logs nothing when there is no error', async () => {
        const response = new Response('ok');

        const result = await catchErrorMiddleware(context, () => Promise.resolve(response));

        expect(result).toBe(response);
        expect(mocks.error).not.toHaveBeenCalled();
        expect(redirect).not.toHaveBeenCalled();
    });

    test('logs the error with its stack trace and request context, then redirects to /500', async () => {
        const error = new Error('LAPIS exploded');

        const result = await catchErrorMiddleware(context, () => Promise.reject(error));

        expect(result).toBe(redirectResponse);
        expect(redirect).toHaveBeenCalledWith('/500');
        expect(mocks.error).toHaveBeenCalledWith('Unhandled error for GET /ebola-zaire/search: Error: LAPIS exploded', {
            method: 'GET',
            path: '/ebola-zaire/search',
            organism: 'ebola-zaire',
            stack: error.stack,
        });
        expect(error.stack).toContain('catchErrorMiddleware.spec.ts');
    });

    test('handles thrown values that are not Errors', async () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- testing a non-Error rejection
        await catchErrorMiddleware(context, () => Promise.reject('just a string'));

        expect(mocks.error).toHaveBeenCalledWith(
            'Unhandled error for GET /ebola-zaire/search: just a string',
            expect.objectContaining({ stack: undefined }),
        );
    });
});
