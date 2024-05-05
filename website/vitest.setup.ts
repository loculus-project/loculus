// Extend Jest "expect" functionality with Testing Library assertions.
import '@testing-library/jest-dom';

import { HttpStatusCode } from 'axios';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';

import type { GetSequencesResponse, Group, SequenceEntryToEdit, SubmissionIdMapping } from './src/types/backend.ts';
import type { DetailsResponse, InsertionsResponse, LapisError, MutationsResponse } from './src/types/lapis.ts';
import type { RuntimeConfig } from './src/types/runtimeConfig.ts';

export const DEFAULT_GROUP_NAME = 'testGroup';

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
    insecureCookies: true,
    backendKeycloakClientSecret: 'dummy',
} as RuntimeConfig;

export const metadataKey = 'originalMetaDataField';
export const editableEntry = 'originalMetaDataValue';
export const defaultReviewData: SequenceEntryToEdit = {
    accession: '1',
    version: 1,
    status: 'HAS_ERRORS',
    groupId: 1,
    errors: [
        {
            source: [
                {
                    name: metadataKey,
                    type: 'Metadata',
                },
            ],
            message: 'errorMessage',
        },
    ],
    warnings: [
        {
            source: [
                {
                    name: metadataKey,
                    type: 'Metadata',
                },
            ],
            message: 'warningMessage',
        },
    ],
    originalData: {
        metadata: {
            [metadataKey]: editableEntry,
        },
        unalignedNucleotideSequences: {
            originalSequenceName: 'originalUnalignedNucleotideSequencesValue',
        },
    },
    processedData: {
        metadata: {
            processedMetaDataField: 'processedMetaDataValue',
            nullField: null,
        },
        unalignedNucleotideSequences: {
            unalignedProcessedSequenceName: 'processedUnalignedNucleotideSequencesValue',
        },
        alignedNucleotideSequences: {
            alignedProcessedSequenceName: 'processedAlignedNucleotideSequencesValue',
        },
        nucleotideInsertions: {
            processedInsertionSequenceName: ['nucleotideInsertion1', 'nucleotideInsertion2'],
        },
        alignedAminoAcidSequences: {
            alignedProcessedGeneName: 'processedAminoAcidSequencesValue',
        },
        aminoAcidInsertions: {
            processedInsertionGeneName: ['aminoAcidInsertion1', 'aminoAcidInsertion2'],
        },
    },
};

export const testOrganism = 'testOrganism';
export const testAccessToken = 'someTestToken';

export const testServer = setupServer();

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
    getGroupsOfUser: (statusCode: number = 200, response: any = [{ groupName: DEFAULT_GROUP_NAME }]) => {
        testServer.use(
            http.get(`${testConfig.serverSide.backendUrl}/user/groups`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
    getSequences: (
        statusCode: number = 200,
        response: GetSequencesResponse = { sequenceEntries: [], statusCounts: {} },
        callback?: (request: Request) => void,
    ) => {
        testServer.use(
            http.get(`${testConfig.serverSide.backendUrl}/${testOrganism}/get-sequences`, ({ request }) => {
                if (callback !== undefined) {
                    callback(request);
                }
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
    getDataToEdit: (statusCode: number = 200, response = defaultReviewData) => {
        testServer.use(
            http.get(`${testConfig.serverSide.backendUrl}/${testOrganism}/get-data-to-edit/*`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
    deleteSequences: (statusCode: number = 200, response: any = []) => {
        testServer.use(
            http.delete(`${testConfig.serverSide.backendUrl}/${testOrganism}/delete-sequence-entry-versions`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
    approveSequences: (statusCode: number = 200, response: any = []) => {
        testServer.use(
            http.post(`${testConfig.serverSide.backendUrl}/${testOrganism}/approve-processed-data`, () => {
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
            http.post(`${testConfig.serverSide.lapisUrls.dummy}/sample/details`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
    alignedNucleotideSequences: (statusCode: number = 200, response: string | LapisError) => {
        testServer.use(
            http.post(`${testConfig.serverSide.lapisUrls.dummy}/sample/alignedNucleotideSequences`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
    alignedNucleotideSequencesMultiSegment: (
        statusCode: number = 200,
        response: string | LapisError,
        segmentName: string,
    ) => {
        testServer.use(
            http.post(
                `${testConfig.serverSide.lapisUrls.dummy}/sample/alignedNucleotideSequences/${segmentName}`,
                () => {
                    return new Response(JSON.stringify(response), {
                        status: statusCode,
                    });
                },
            ),
        );
    },
    unalignedNucleotideSequences: (statusCode: number = 200, response: string | LapisError) => {
        testServer.use(
            http.post(`${testConfig.serverSide.lapisUrls.dummy}/sample/unalignedNucleotideSequences`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
    unalignedNucleotideSequencesMultiSegment: (
        statusCode: number = 200,
        response: string | LapisError,
        segmentName: string,
    ) => {
        testServer.use(
            http.post(
                `${testConfig.serverSide.lapisUrls.dummy}/sample/unalignedNucleotideSequences/${segmentName}`,
                () => {
                    return new Response(JSON.stringify(response), {
                        status: statusCode,
                    });
                },
            ),
        );
    },
    nucleotideMutations: (statusCode: number = 200, response: MutationsResponse | LapisError) => {
        testServer.use(
            http.post(`${testConfig.serverSide.lapisUrls.dummy}/sample/nucleotideMutations`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
    aminoAcidMutations: (statusCode: number = 200, response: MutationsResponse | LapisError) => {
        testServer.use(
            http.post(`${testConfig.serverSide.lapisUrls.dummy}/sample/aminoAcidMutations`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
    nucleotideInsertions: (statusCode: number = 200, response: InsertionsResponse | LapisError) => {
        testServer.use(
            http.post(`${testConfig.serverSide.lapisUrls.dummy}/sample/nucleotideInsertions`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
    aminoAcidInsertions: (statusCode: number = 200, response: InsertionsResponse | LapisError) => {
        testServer.use(
            http.post(`${testConfig.serverSide.lapisUrls.dummy}/sample/aminoAcidInsertions`, () => {
                return new Response(JSON.stringify(response), {
                    status: statusCode,
                });
            }),
        );
    },
};

export const testGroups: Group[] = [
    {
        groupId: 1,
        groupName: 'Group1',
        institution: 'Institution 1',
        contactEmail: 'group1@institution1.org',
        address: {
            line1: '',
            city: '',
            postalCode: '',
            country: 'Switzerland',
        },
    },
    {
        groupId: 1,
        groupName: 'Group2',
        institution: 'Institution 2',
        contactEmail: 'group2@institution2.org',
        address: {
            line1: '',
            city: '',
            postalCode: '',
            country: 'Switzerland',
        },
    },
];

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
