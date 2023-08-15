// Extend Jest "expect" functionality with Testing Library assertions.
import '@testing-library/jest-dom';

import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

import type { Config } from '../types';

export const testConfig = {
    backendUrl: 'http://localhost:8080',
} as Config;

export const testuser = 'testuser';

export const testServer = setupServer();

export const mockRequest = {
    submit: (statusCode: number = 200, response: any = []) => {
        testServer.use(
            rest.post(`${testConfig.backendUrl}/submit`, (req, res, ctx) => {
                return res(ctx.status(statusCode), ctx.json(response));
            }),
        );
        rest.post('/admin/logs.txt', (req, res, ctx) => {
            return res(ctx.status(200));
        });
    },
};

beforeAll(() => testServer.listen({ onUnhandledRequest: 'error' }));

afterAll(() => testServer.close());

afterEach(() => testServer.resetHandlers());
