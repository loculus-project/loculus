// Extend Jest "expect" functionality with Testing Library assertions.
import '@testing-library/jest-dom';

import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

import type { SubmissionIdMapping } from '../types/backend.ts';
import type { DetailsResponse, InsertionsResponse, LapisError, MutationsResponse } from '../types/lapis.ts';
import type { RuntimeConfig } from '../types/runtimeConfig.ts';

export const testConfig = {
    public: {
        discriminator: 'client',
        backendUrl: 'http://backend.dummy',
        lapisUrls: {
            dummy: 'http://lapis.dummy',
        },
        keycloakUrl: 'http://authentication.dummy',
    },
    serverSide: {
        discriminator: 'server',
        backendUrl: 'http://backend.dummy',
        lapisUrls: {
            dummy: 'http://lapis.dummy',
        },
        keycloakUrl: 'http://authentication.dummy',
    },
} as RuntimeConfig;

export const testOrganism = 'testOrganism';
export const testUser = 'testuser';

const testServer = setupServer();

const backendRequestMocks = {
    submit: (statusCode: number = 200, response: SubmissionIdMapping[] | any = []) => {
        testServer.use(
            rest.post(`${testConfig.serverSide.backendUrl}/${testOrganism}/submit`, (_, res, ctx) => {
                return res(ctx.status(statusCode), ctx.json(response));
            }),
        );
    },
};

const lapisRequestMocks = {
    details: (statusCode: number = 200, response: DetailsResponse | LapisError) => {
        testServer.use(
            rest.post(`${testConfig.serverSide.lapisUrls.dummy}/details`, (_, res, ctx) => {
                return res(ctx.status(statusCode), ctx.json(response));
            }),
        );
    },
    nucleotideMutations: (statusCode: number = 200, response: MutationsResponse | LapisError) => {
        testServer.use(
            rest.post(`${testConfig.serverSide.lapisUrls.dummy}/nucleotideMutations`, (_, res, ctx) => {
                return res(ctx.status(statusCode), ctx.json(response));
            }),
        );
    },
    aminoAcidMutations: (statusCode: number = 200, response: MutationsResponse | LapisError) => {
        testServer.use(
            rest.post(`${testConfig.serverSide.lapisUrls.dummy}/aminoAcidMutations`, (_, res, ctx) => {
                return res(ctx.status(statusCode), ctx.json(response));
            }),
        );
    },
    nucleotideInsertions: (statusCode: number = 200, response: InsertionsResponse | LapisError) => {
        testServer.use(
            rest.post(`${testConfig.serverSide.lapisUrls.dummy}/nucleotideInsertions`, (_, res, ctx) => {
                return res(ctx.status(statusCode), ctx.json(response));
            }),
        );
    },
    aminoAcidInsertions: (statusCode: number = 200, response: InsertionsResponse | LapisError) => {
        testServer.use(
            rest.post(`${testConfig.serverSide.lapisUrls.dummy}/aminoAcidInsertions`, (_, res, ctx) => {
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
