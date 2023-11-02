import { makeApi, makeEndpoint, makeParameters } from '@zodios/core';
import z from 'zod';

import {
    headerId,
    problemDetail,
    sequenceIds,
    sequenceReview,
    sequenceStatus,
    sequenceVersionsObject,
    submitFiles,
    unprocessedData,
} from '../types/backend.ts';

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
    errors: [
        { status: 'default', schema: problemDetail },
        { status: 400, schema: problemDetail },
        { status: 422, schema: problemDetail },
    ],
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
    errors: [
        { status: 'default', schema: problemDetail },
        { status: 400, schema: problemDetail },
        { status: 422, schema: problemDetail },
    ],
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
    errors: [
        { status: 'default', schema: problemDetail },
        { status: 422, schema: problemDetail },
    ],
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
            schema: sequenceVersionsObject,
        },
    ],
    response: z.never(),
    errors: [{ status: 'default', schema: problemDetail }],
});

const deleteSequencesEndpoint = makeEndpoint({
    method: 'delete',
    path: '/delete-sequences',
    alias: 'deleteSequences',
    parameters: [
        ...usernameParameters,
        {
            name: 'sequenceVersions',
            type: 'Body',
            schema: sequenceVersionsObject,
        },
    ],
    response: z.never(),
    errors: [{ status: 'default', schema: problemDetail }],
});

const confirmRevocationEndpoint = makeEndpoint({
    method: 'post',
    path: '/confirm-revocation',
    alias: 'confirmRevocation',
    parameters: [
        ...usernameParameters,
        {
            name: 'sequenceVersions',
            type: 'Body',
            schema: sequenceVersionsObject,
        },
    ],
    response: z.never(),
    errors: [
        { status: 'default', schema: problemDetail },
        { status: 422, schema: problemDetail },
    ],
});

const extractUnprocessedDataEndpoint = makeEndpoint({
    method: 'post',
    path: '/extract-unprocessed-data',
    alias: 'extractUnprocessedData',
    parameters: [
        {
            name: 'numberOfSequences',
            type: 'Query',
            schema: z.number(),
        },
    ],
    response: z.union([z.string(), unprocessedData]),
});

const submitProcessedDataEndpoint = makeEndpoint({
    method: 'post',
    path: '/submit-processed-data',
    alias: 'submitProcessedData',
    parameters: [
        {
            name: 'data',
            type: 'Body',
            schema: z.string(),
        },
    ],
    response: z.never(),
    errors: [
        { status: 'default', schema: problemDetail },
        { status: 422, schema: problemDetail },
    ],
});

const getReleasedDataEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-released-data',
    alias: 'getReleasedData',
    response: z.string(),
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
    extractUnprocessedDataEndpoint,
    submitProcessedDataEndpoint,
    getReleasedDataEndpoint,
]);
