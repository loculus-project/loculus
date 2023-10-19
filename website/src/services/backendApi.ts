import { makeApi, makeEndpoint } from '@zodios/core';
import z from 'zod';
import { sequenceIds, sequenceReview, sequenceStatus, sequenceVersion, unprocessedData } from '../types.ts';

const getDataToReviewEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-data-to-review/:sequenceId/:version',
    alias: 'getDataToReview',
    parameters: [
        {
            name: 'username',
            type: 'Query',
            schema: z.string(),
        },
    ],
    response: sequenceReview,
});

const revokeSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: '/revoke',
    alias: 'revokeSequences',
    parameters: [
        {
            name: 'username',
            type: 'Query',
            schema: z.string(),
        },
        {
            name: 'sequenceIds',
            type: 'Body',
            schema: sequenceIds,
        },
    ],
    response: z.array(sequenceStatus),
});

const submitReviewedSequenceEndpoint = makeEndpoint({
    method: 'post',
    path: '/submit-reviewed-sequence',
    alias: 'submitReviewedSequence',
    parameters: [
        {
            name: 'username',
            type: 'Query',
            schema: z.string(),
        },
        {
            name: 'data',
            type: 'Body',
            schema: unprocessedData,
        },
    ],
    response: z.never(),
});

const getSequencesOfUserEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-sequences-of-user',
    alias: 'getSequencesOfUser',
    parameters: [
        {
            name: 'username',
            type: 'Query',
            schema: z.string(),
        },
    ],
    response: z.array(sequenceStatus),
});

const approveProcessedDataEndpoint = makeEndpoint({
    method: 'post',
    path: '/approve-processed-data',
    alias: 'approveProcessedData',
    parameters: [
        {
            name: 'username',
            type: 'Query',
            schema: z.string(),
        },
        {
            name: 'data',
            type: 'Body',
            schema: z.object({
                sequenceVersions: z.array(sequenceVersion),
            }),
        },
    ],
    response: z.never(),
});

const deleteSequencesEndpoint = makeEndpoint({
    method: 'delete',
    path: '/delete-sequences',
    alias: 'deleteSequences',
    parameters: [
        {
            name: 'username',
            type: 'Query',
            schema: z.string(),
        },
        {
            name: 'data',
            type: 'Body',
            schema: sequenceIds,
        },
    ],
    response: z.never(),
});

const confirmRevocationEndpoint = makeEndpoint({
    method: 'post',
    path: '/confirm-revocation',
    alias: 'confirmRevocation',
    parameters: [
        {
            name: 'username',
            type: 'Query',
            schema: z.string(),
        },
        {
            name: 'sequenceIds',
            type: 'Body',
            schema: sequenceIds,
        },
    ],
    response: z.number(),
});

export const backendApi = makeApi([
    getDataToReviewEndpoint,
    revokeSequencesEndpoint,
    submitReviewedSequenceEndpoint,
    getSequencesOfUserEndpoint,
    approveProcessedDataEndpoint,
    deleteSequencesEndpoint,
    confirmRevocationEndpoint,
]);
