import { makeApi, makeEndpoint } from '@zodios/core';
import z from 'zod';

import { authorizationHeader, notAuthorizedError } from './commonApiTypes.ts';
import { authorProfile, seqSets, seqSetRecords, citedByResult } from '../types/seqSetCitation.ts';

const getSeqSetsOfUserEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-seqsets-of-user',
    alias: 'getSeqSetsOfUser',
    parameters: [authorizationHeader],
    response: seqSets,
    errors: [notAuthorizedError],
});

const getUserCitedByEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-user-cited-by-seqset?username=:username',
    alias: 'getUserCitedBy',
    parameters: [authorizationHeader],
    response: citedByResult,
    errors: [notAuthorizedError],
});

const getSeqSetCitedByEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-seqset-cited-by-publication?seqSetId=:seqSetId&version=:version',
    alias: 'getSeqSetCitedBy',
    response: citedByResult,
    errors: [notAuthorizedError],
});

const getSeqSetEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-seqset?seqSetId=:seqSetId&version=:version',
    alias: 'getSeqSet',
    response: seqSets,
    errors: [notAuthorizedError],
});

const getSeqSetRecordsEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-seqset-records?seqSetId=:seqSetId&version=:version',
    alias: 'getSeqSetRecords',
    response: seqSetRecords,
    errors: [notAuthorizedError],
});

const validateSeqSetRecords = makeEndpoint({
    method: 'post',
    path: '/validate-seqset-records',
    alias: 'validateSeqSetRecords',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: z
                .array(
                    z.object({
                        accession: z.string().optional(),
                        type: z.string().optional(),
                    }),
                )
                .optional(),
        },
    ],
    response: z.object({
        valid: z.boolean(),
    }),
    errors: [notAuthorizedError],
});

const createSeqSetEndpoint = makeEndpoint({
    method: 'post',
    path: '/create-seqset',
    alias: 'createSeqSet',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: z.object({
                name: z.string(),
                description: z.string().optional(),
                records: z
                    .array(
                        z.object({
                            accession: z.string().optional(),
                            type: z.string().optional(),
                        }),
                    )
                    .optional(),
            }),
        },
    ],
    response: z.object({
        seqSetId: z.string(),
        seqSetVersion: z.number(),
    }),
    errors: [notAuthorizedError],
});

const createSeqSetDOIEndpoint = makeEndpoint({
    method: 'post',
    path: '/create-seqset-doi?seqSetId=:seqSetId&version=:seqSetVersion',
    alias: 'createSeqSetDOI',
    parameters: [authorizationHeader],
    response: z.object({
        seqSetId: z.string(),
        seqSetVersion: z.number(),
    }),
    errors: [notAuthorizedError],
});

const updateSeqSetEndpoint = makeEndpoint({
    method: 'put',
    path: '/update-seqset',
    alias: 'updateSeqSet',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: z.object({
                seqSetId: z.string(),
                name: z.string(),
                description: z.string().optional(),
                records: z
                    .array(
                        z.object({
                            accession: z.string().optional(),
                            type: z.string().optional(),
                        }),
                    )
                    .optional(),
            }),
        },
    ],
    response: z.object({
        seqSetId: z.string(),
        seqSetVersion: z.number(),
    }),
    errors: [notAuthorizedError],
});

const deleteSeqSetEndpoint = makeEndpoint({
    method: 'delete',
    path: '/delete-seqset?seqSetId=:seqSetId&version=:seqSetVersion',
    alias: 'deleteSeqSet',
    parameters: [authorizationHeader],
    response: z.never(),
    errors: [notAuthorizedError],
});

const getAuthorEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-author?username=:username',
    alias: 'getAuthor',
    response: authorProfile,
    errors: [notAuthorizedError],
});

export const seqSetCitationApi = makeApi([
    getSeqSetsOfUserEndpoint,
    getUserCitedByEndpoint,
    getSeqSetCitedByEndpoint,
    getSeqSetEndpoint,
    getSeqSetRecordsEndpoint,
    validateSeqSetRecords,
    createSeqSetEndpoint,
    createSeqSetDOIEndpoint,
    updateSeqSetEndpoint,
    deleteSeqSetEndpoint,
    getAuthorEndpoint,
]);
