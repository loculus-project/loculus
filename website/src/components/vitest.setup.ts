// Extend Jest "expect" functionality with Testing Library assertions.
import '@testing-library/jest-dom';

import { http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';
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

export const testServer = setupWorker();

export const mockRequest = {
    submit: (statusCode: number = 200, response: any = []) => {
        testServer.use(
            http.post(`${testConfig.forServer.backendUrl}/submit`, () => {
                return HttpResponse.json(response, { status: statusCode });
            }),
        );
    },
};

beforeAll(async () => {
    await testServer.start();
});

afterAll(() => testServer.stop());

afterEach(() => testServer.resetHandlers());
