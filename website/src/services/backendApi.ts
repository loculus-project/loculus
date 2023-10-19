import { makeApi, makeEndpoint, makeParameters } from '@zodios/core';
import z from 'zod';
import {
    headerId,
    sequenceIds,
    sequenceReview,
    sequenceStatus,
    sequenceVersion,
    submitFiles,
    unprocessedData,
} from '../types.ts';

const usernameParameters = makeParameters([
    {
        name: 'username',
        type: 'Query',
        schema: z.string(),
    },
]);

const submitEndpoint = makeEndpoint({
    method: 'post',
    path: '/submit',
    alias: 'submit',
    requestFormat: 'form-data',
    parameters: [
        {
            name: 'data',
            type: 'Body',
            schema: submitFiles,
        },
    ],
    response: z.array(headerId),
});

const reviseEndpoint = makeEndpoint({
    method: 'post',
    path: '/revise',
    alias: 'revise',
    requestFormat: 'form-data',
    parameters: [
        {
            name: 'data',
            type: 'Body',
            schema: submitFiles,
        },
    ],
    response: z.array(headerId),
});

const getDataToReviewEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-data-to-review/:sequenceId/:version',
    alias: 'getDataToReview',
    parameters: usernameParameters,
    response: sequenceReview,
});

const revokeSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: '/revoke',
    alias: 'revokeSequences',
    parameters: [
        ...usernameParameters,
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
        ...usernameParameters,
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
    parameters: usernameParameters,
    response: z.array(sequenceStatus),
});

const approveProcessedDataEndpoint = makeEndpoint({
    method: 'post',
    path: '/approve-processed-data',
    alias: 'approveProcessedData',
    parameters: [
        ...usernameParameters,
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
        ...usernameParameters,
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
        ...usernameParameters,
        {
            name: 'sequenceIds',
            type: 'Body',
            schema: sequenceIds,
        },
    ],
    response: z.number(),
});

export const backendApi = makeApi([
    submitEndpoint,
    reviseEndpoint,
    getDataToReviewEndpoint,
    revokeSequencesEndpoint,
    submitReviewedSequenceEndpoint,
    getSequencesOfUserEndpoint,
    approveProcessedDataEndpoint,
    deleteSequencesEndpoint,
    confirmRevocationEndpoint,
]);
