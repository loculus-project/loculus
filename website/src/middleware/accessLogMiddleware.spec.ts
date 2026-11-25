import type { APIContext, MiddlewareNext } from 'astro';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    info: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('../logger.ts', () => ({
    getInstanceLogger: () => ({
        debug: mocks.debug,
        error: vi.fn(),
        info: mocks.info,
        warn: vi.fn(),
    }),
}));

import { accessLogMiddleware } from './accessLogMiddleware.ts';

type ContextOptions = {
    path?: string;
    method?: string;
    organism?: string;
    userAgent?: string;
    session?: App.Locals['session'];
};

const createContext = (options: ContextOptions = {}) => {
    const path = options.path ?? '/ebola-zaire/search';
    // `organism` is checked with `in` so that tests can pass `organism: undefined` explicitly
    const organism = 'organism' in options ? options.organism : 'ebola-zaire';
    return {
        request: new Request(`https://loculus.test${path}`, {
            method: options.method ?? 'GET',
            headers: [['user-agent', options.userAgent ?? 'Mozilla/5.0']],
        }),
        url: new URL(`https://loculus.test${path}`),
        params: { organism },
        locals: { session: options.session },
    } as unknown as APIContext;
};

const respondWith = (status: number, setSession?: (context: APIContext) => void) =>
    ((context: APIContext) => () => {
        setSession?.(context);
        return Promise.resolve(new Response(null, { status }));
    }) as (context: APIContext) => MiddlewareNext;

describe('accessLogMiddleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('logs one info line with request details for a logged-in user', async () => {
        const context = createContext();
        // The session is set by authMiddleware, which runs after the access log middleware
        const next = respondWith(200, (ctx) => {
            ctx.locals.session = {
                isLoggedIn: true,
                user: { username: 'testuser', email: 'test@example.com' },
                token: { accessToken: 'secret-access-token', refreshToken: 'secret-refresh-token' },
            };
        })(context);

        const response = await accessLogMiddleware(context, next);

        expect((response as Response).status).toBe(200);
        expect(mocks.info).toHaveBeenCalledTimes(1);
        expect(mocks.info).toHaveBeenCalledWith('GET /ebola-zaire/search 200', {
            method: 'GET',
            path: '/ebola-zaire/search',
            status: 200,
            durationMs: expect.any(Number) as number,
            organism: 'ebola-zaire',
            loggedIn: true,
            user: 'testuser',
        });
    });

    test('never logs tokens or email addresses', async () => {
        const context = createContext({
            session: {
                isLoggedIn: true,
                user: { username: 'testuser', email: 'test@example.com' },
                token: { accessToken: 'secret-access-token', refreshToken: 'secret-refresh-token' },
            },
        });

        await accessLogMiddleware(context, respondWith(200)(context));

        const logged = JSON.stringify(mocks.info.mock.calls);
        expect(logged).not.toContain('secret-access-token');
        expect(logged).not.toContain('secret-refresh-token');
        expect(logged).not.toContain('test@example.com');
    });

    test('logs anonymous requests without a user', async () => {
        const context = createContext({ path: '/', organism: undefined, method: 'POST' });

        await accessLogMiddleware(context, respondWith(302)(context));

        expect(mocks.info).toHaveBeenCalledWith(
            'POST / 302',
            expect.objectContaining({ status: 302, organism: undefined, loggedIn: false, user: undefined }),
        );
    });

    test('logs Kubernetes probes at debug instead of info', async () => {
        const context = createContext({ path: '/', organism: undefined, userAgent: 'kube-probe/1.31' });

        await accessLogMiddleware(context, respondWith(200)(context));

        expect(mocks.info).not.toHaveBeenCalled();
        expect(mocks.debug).toHaveBeenCalledWith('GET / 200', expect.objectContaining({ status: 200 }));
    });

    test('logs status 500 and rethrows when a later middleware throws', async () => {
        const context = createContext();
        const error = new Error('boom');
        const next = (() => Promise.reject(error)) as MiddlewareNext;

        await expect(accessLogMiddleware(context, next)).rejects.toBe(error);

        expect(mocks.info).toHaveBeenCalledWith(
            'GET /ebola-zaire/search 500',
            expect.objectContaining({ status: 500 }),
        );
    });
});
