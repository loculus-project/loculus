// Extend Jest "expect" functionality with Testing Library assertions.
import '@testing-library/jest-dom';

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

import type { RuntimeConfig } from '../types';

export const testConfig = {
    forClient: {
        backendUrl: 'http://localhost:8080',
        lapisUrl: 'dummyLapisUrl',
    },
    forServer: {
        backendUrl: 'http://localhost:8080',
        lapisUrl: 'dummyLapisUrl',
    },
} as RuntimeConfig;

export const testuser = 'testuser';

export const testServer = setupServer();

export const mockRequest = {
    submit: (statusCode: number = 200, response: any = []) => {
        testServer.use(
            http.post(`${testConfig.forServer.backendUrl}/submit`, () => {
                return HttpResponse.json(response, { status: statusCode });
            }),
        );
    },
};

beforeAll(() => testServer.listen({ onUnhandledRequest: 'error' }));

afterAll(() => testServer.close());

afterEach(() => testServer.resetHandlers());
