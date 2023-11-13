// Extend Jest "expect" functionality with Testing Library assertions.
import '@testing-library/jest-dom';

import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

import type { SubmissionIdMapping } from '../types/backend.ts';
import type { DetailsResponse, InsertionsResponse, LapisError, MutationsResponse } from '../types/lapis.ts';
import type { RuntimeConfig } from '../types/runtimeConfig.ts';

export const testConfig = {
    forClient: {
        backendUrl: 'http://backend.dummy',
        lapisUrl: 'http://lapis.dummy',
    },
    forServer: {
        backendUrl: 'http://backend.dummy',
        lapisUrl: 'http://lapis.dummy',
    },
} as RuntimeConfig;

export const testuser = 'testuser';

const testServer = setupServer();

const backendRequestMocks = {
    submit: (statusCode: number = 200, response: SubmissionIdMapping[] | any = []) => {
        testServer.use(
            rest.post(`${testConfig.forServer.backendUrl}/submit`, (_, res, ctx) => {
                return res(ctx.status(statusCode), ctx.json(response));
            }),
        );
    },
};

const lapisRequestMocks = {
    details: (statusCode: number = 200, response: DetailsResponse | LapisError) => {
        testServer.use(
            rest.post(`${testConfig.forServer.lapisUrl}/details`, (_, res, ctx) => {
                return res(ctx.status(statusCode), ctx.json(response));
            }),
        );
    },
    nucleotideMutations: (statusCode: number = 200, response: MutationsResponse | LapisError) => {
        testServer.use(
            rest.post(`${testConfig.forServer.lapisUrl}/nucleotideMutations`, (_, res, ctx) => {
                return res(ctx.status(statusCode), ctx.json(response));
            }),
        );
    },
    aminoAcidMutations: (statusCode: number = 200, response: MutationsResponse | LapisError) => {
        testServer.use(
            rest.post(`${testConfig.forServer.lapisUrl}/aminoAcidMutations`, (_, res, ctx) => {
                return res(ctx.status(statusCode), ctx.json(response));
            }),
        );
    },
    nucleotideInsertions: (statusCode: number = 200, response: InsertionsResponse | LapisError) => {
        testServer.use(
            rest.post(`${testConfig.forServer.lapisUrl}/nucleotideInsertions`, (_, res, ctx) => {
                return res(ctx.status(statusCode), ctx.json(response));
            }),
        );
    },
    aminoAcidInsertions: (statusCode: number = 200, response: InsertionsResponse | LapisError) => {
        testServer.use(
            rest.post(`${testConfig.forServer.lapisUrl}/aminoAcidInsertions`, (_, res, ctx) => {
                return res(ctx.status(statusCode), ctx.json(response));
            }),
        );
    },
};

export const mockRequest = {
    backend: backendRequestMocks,
    lapis: lapisRequestMocks,
};

beforeAll(() => testServer.listen({ onUnhandledRequest: 'error' }));

afterAll(() => testServer.close());

afterEach(() => testServer.resetHandlers());
