import diagnosticsChannel from 'node:diagnostics_channel';

import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../logger.ts', () => ({
    getInstanceLogger: () => ({
        debug: mocks.debug,
        error: mocks.error,
        info: vi.fn(),
        warn: mocks.warn,
    }),
}));

import { installOutgoingRequestLogging } from './outgoingRequestLogger.ts';

// MSW (set up in vitest.setup.ts) replaces node:http and fetch in tests, so real requests may not reach
// the diagnostics channels. Instead, we publish the events that Node and undici would publish.
const publish = (channel: string, message: object) => diagnosticsChannel.channel(channel).publish(message);

const createHttpRequest = () => ({
    method: 'POST',
    protocol: 'http:',
    host: 'loculus-backend-service',
    path: '/ebola-zaire/get-sequences',
    getHeader: (name: string) => (name === 'host' ? 'loculus-backend-service:8079' : undefined),
});
const httpUrl = 'http://loculus-backend-service:8079/ebola-zaire/get-sequences';

const createFetchRequest = () => ({
    method: 'GET',
    origin: 'http://loculus-keycloak-service:8083',
    path: '/realms/loculus/protocol/openid-connect/userinfo',
});
const fetchUrl = 'http://loculus-keycloak-service:8083/realms/loculus/protocol/openid-connect/userinfo';

describe('outgoingRequestLogger', () => {
    beforeAll(() => {
        installOutgoingRequestLogging();
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('node:http requests (axios, openid-client)', () => {
        test('logs successful responses at debug with url, status and duration', () => {
            const request = createHttpRequest();
            publish('http.client.request.start', { request });
            publish('http.client.response.finish', { request, response: { statusCode: 200 } });

            expect(mocks.debug).toHaveBeenCalledWith(`POST ${httpUrl} 200`, {
                method: 'POST',
                url: httpUrl,
                status: 200,
                durationMs: expect.any(Number) as number,
            });
            expect(mocks.warn).not.toHaveBeenCalled();
            expect(mocks.error).not.toHaveBeenCalled();
        });

        test('logs 4xx responses at warn', () => {
            const request = createHttpRequest();
            publish('http.client.request.start', { request });
            publish('http.client.response.finish', { request, response: { statusCode: 404 } });

            expect(mocks.warn).toHaveBeenCalledWith(`POST ${httpUrl} 404`, expect.objectContaining({ status: 404 }));
            expect(mocks.debug).not.toHaveBeenCalled();
        });

        test('logs 5xx responses at error', () => {
            const request = createHttpRequest();
            publish('http.client.request.start', { request });
            publish('http.client.response.finish', { request, response: { statusCode: 503 } });

            expect(mocks.error).toHaveBeenCalledWith(`POST ${httpUrl} 503`, expect.objectContaining({ status: 503 }));
        });

        test('logs network errors at error', () => {
            const request = createHttpRequest();
            publish('http.client.request.start', { request });
            publish('http.client.request.error', { request, error: new Error('connect ECONNREFUSED') });

            expect(mocks.error).toHaveBeenCalledWith(`POST ${httpUrl} failed: connect ECONNREFUSED`, {
                method: 'POST',
                url: httpUrl,
                durationMs: expect.any(Number) as number,
                error: 'connect ECONNREFUSED',
            });
        });

        test('falls back to request.host when there is no host header', () => {
            const request = { ...createHttpRequest(), getHeader: () => undefined };
            publish('http.client.response.finish', { request, response: { statusCode: 200 } });

            expect(mocks.debug).toHaveBeenCalledWith(
                'POST http://loculus-backend-service/ebola-zaire/get-sequences 200',
                expect.objectContaining({ durationMs: undefined }),
            );
        });

        test('does not log the query string', () => {
            const request = { ...createHttpRequest(), path: '/ebola-zaire/get-sequences?token=secret&groupId=1' };
            publish('http.client.response.finish', { request, response: { statusCode: 404 } });
            publish('http.client.request.error', { request, error: new Error('socket hang up') });

            expect(mocks.warn).toHaveBeenCalledWith(`POST ${httpUrl} 404`, expect.objectContaining({ url: httpUrl }));
            expect(mocks.error).toHaveBeenCalledWith(
                `POST ${httpUrl} failed: socket hang up`,
                expect.objectContaining({ url: httpUrl }),
            );
            expect(JSON.stringify([mocks.warn.mock.calls, mocks.error.mock.calls])).not.toContain('secret');
        });
    });

    describe('fetch (undici) requests', () => {
        test('logs successful responses at debug with url, status and duration', () => {
            const request = createFetchRequest();
            publish('undici:request:create', { request });
            publish('undici:request:headers', { request, response: { statusCode: 200 } });

            expect(mocks.debug).toHaveBeenCalledWith(`GET ${fetchUrl} 200`, {
                method: 'GET',
                url: fetchUrl,
                status: 200,
                durationMs: expect.any(Number) as number,
            });
        });

        test('logs 4xx at warn and 5xx at error', () => {
            const first = createFetchRequest();
            publish('undici:request:create', { request: first });
            publish('undici:request:headers', { request: first, response: { statusCode: 401 } });
            const second = createFetchRequest();
            publish('undici:request:create', { request: second });
            publish('undici:request:headers', { request: second, response: { statusCode: 500 } });

            expect(mocks.warn).toHaveBeenCalledWith(`GET ${fetchUrl} 401`, expect.objectContaining({ status: 401 }));
            expect(mocks.error).toHaveBeenCalledWith(`GET ${fetchUrl} 500`, expect.objectContaining({ status: 500 }));
        });

        test('logs network errors at error', () => {
            const request = createFetchRequest();
            publish('undici:request:create', { request });
            publish('undici:request:error', { request, error: new Error('fetch failed') });

            expect(mocks.error).toHaveBeenCalledWith(
                `GET ${fetchUrl} failed: fetch failed`,
                expect.objectContaining({ error: 'fetch failed' }),
            );
        });

        test('does not log the query string', () => {
            const request = { ...createFetchRequest(), path: `${createFetchRequest().path}?access_token=secret` };
            publish('undici:request:headers', { request, response: { statusCode: 401 } });
            publish('undici:request:error', { request, error: new Error('fetch failed') });

            expect(mocks.warn).toHaveBeenCalledWith(`GET ${fetchUrl} 401`, expect.objectContaining({ url: fetchUrl }));
            expect(mocks.error).toHaveBeenCalledWith(
                `GET ${fetchUrl} failed: fetch failed`,
                expect.objectContaining({ url: fetchUrl }),
            );
            expect(JSON.stringify([mocks.warn.mock.calls, mocks.error.mock.calls])).not.toContain('secret');
        });
    });

    test('installing twice does not log requests twice', () => {
        installOutgoingRequestLogging();
        const request = createHttpRequest();
        publish('http.client.response.finish', { request, response: { statusCode: 200 } });

        expect(mocks.debug).toHaveBeenCalledTimes(1);
    });
});
