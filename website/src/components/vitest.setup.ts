// Extend Jest "expect" functionality with Testing Library assertions.
import '@testing-library/jest-dom';

import { HttpStatusCode } from 'axios';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';

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
export const testAccessToken = 'someTestToken';

const testServer = setupServer();

const backendRequestMocks = {
    submit: (statusCode: number = 200, response: SubmissionIdMapping[] | any = []) => {
        testServer.use(
            http.post(`${testConfig.serverSide.backendUrl}/${testOrganism}/submit`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
};

const lapisRequestMocks = {
    details: (statusCode: number = 200, response: DetailsResponse | LapisError) => {
        testServer.use(
            http.post(`${testConfig.serverSide.lapisUrls.dummy}/details`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
    nucleotideMutations: (statusCode: number = 200, response: MutationsResponse | LapisError) => {
        testServer.use(
            http.post(`${testConfig.serverSide.lapisUrls.dummy}/nucleotideMutations`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
    aminoAcidMutations: (statusCode: number = 200, response: MutationsResponse | LapisError) => {
        testServer.use(
            http.post(`${testConfig.serverSide.lapisUrls.dummy}/aminoAcidMutations`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
    nucleotideInsertions: (statusCode: number = 200, response: InsertionsResponse | LapisError) => {
        testServer.use(
            http.post(`${testConfig.serverSide.lapisUrls.dummy}/nucleotideInsertions`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
    aminoAcidInsertions: (statusCode: number = 200, response: InsertionsResponse | LapisError) => {
        testServer.use(
            http.post(`${testConfig.serverSide.lapisUrls.dummy}/aminoAcidInsertions`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
};

export const mockRequest = {
    backend: backendRequestMocks,
    lapis: lapisRequestMocks,
};

beforeAll(() => testServer.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
    testServer.use(
        http.post('http://localhost:3000/admin/logs.txt', () => {
            return new Response(undefined, {
                status: HttpStatusCode.Ok,
            });
        }),
    );
});

afterAll(() => testServer.close());

afterEach(() => testServer.resetHandlers());
