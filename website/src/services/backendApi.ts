import { makeApi, makeEndpoint, makeErrors, makeParameters } from '@zodios/core';
import z from 'zod';

import {
    sequenceEntryToEdit,
    accessions,
    accessionVersionsObject,
    problemDetail,
    sequenceEntryStatus,
    submissionIdMapping,
    submitFiles,
    unprocessedData,
    uploadFiles,
} from '../types/backend.ts';

const [authorizationHeader] = makeParameters([
    {
        name: 'Authorization',
        type: 'Header',
        schema: z.string().includes('Bearer ', { position: 0 }),
    },
]);

function withOrganismPathSegment<Path extends `/${string}`>(path: Path) {
    return `/:organism${path}` as const;
}

const notAuthorizedError = makeErrors([
    {
        status: 401,
        schema: z.never(),
    },
])[0];

const submitEndpoint = makeEndpoint({
    method: 'post',
    path: withOrganismPathSegment('/submit'),
    alias: 'submit',
    requestFormat: 'form-data',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: submitFiles,
        },
    ],
    response: z.array(submissionIdMapping),
    errors: [
        { status: 'default', schema: problemDetail },
        { status: 400, schema: problemDetail },
        { status: 422, schema: problemDetail },
        notAuthorizedError,
    ],
});

const reviseEndpoint = makeEndpoint({
    method: 'post',
    path: withOrganismPathSegment('/revise'),
    alias: 'revise',
    requestFormat: 'form-data',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: uploadFiles,
        },
    ],
    response: z.array(submissionIdMapping),
    errors: [
        { status: 'default', schema: problemDetail },
        { status: 400, schema: problemDetail },
        { status: 422, schema: problemDetail },
        notAuthorizedError,
    ],
});

const getDataToEditEndpoint = makeEndpoint({
    method: 'get',
    path: withOrganismPathSegment('/get-data-to-edit/:accession/:version'),
    alias: 'getDataToEdit',
    parameters: [authorizationHeader],
    response: sequenceEntryToEdit,
    errors: [notAuthorizedError],
});

const revokeSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: withOrganismPathSegment('/revoke'),
    alias: 'revokeSequences',
    parameters: [
        authorizationHeader,
        {
            name: 'accessions',
            type: 'Body',
            schema: accessions,
        },
    ],
    response: z.array(sequenceEntryStatus),
    errors: [{ status: 'default', schema: problemDetail }, { status: 422, schema: problemDetail }, notAuthorizedError],
});

const submitReviewedSequenceEndpoint = makeEndpoint({
    method: 'post',
    path: withOrganismPathSegment('/submit-edited-data'),
    alias: 'submitReviewedSequence',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: unprocessedData,
        },
    ],
    response: z.never(),
    errors: [notAuthorizedError],
});

const getSequencesOfUserEndpoint = makeEndpoint({
    method: 'get',
    path: withOrganismPathSegment('/get-sequences-of-user'),
    alias: 'getSequencesOfUser',
    parameters: [authorizationHeader],
    response: z.array(sequenceEntryStatus),
    errors: [notAuthorizedError],
});

const approveProcessedDataEndpoint = makeEndpoint({
    method: 'post',
    path: withOrganismPathSegment('/approve-processed-data'),
    alias: 'approveProcessedData',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: accessionVersionsObject,
        },
    ],
    response: z.never(),
    errors: [{ status: 'default', schema: problemDetail }, notAuthorizedError],
});

const deleteSequencesEndpoint = makeEndpoint({
    method: 'delete',
    path: withOrganismPathSegment('/delete-sequence-entry-versions'),
    alias: 'deleteSequences',
    parameters: [
        authorizationHeader,
        {
            name: 'accessionVersions',
            type: 'Body',
            schema: accessionVersionsObject,
        },
    ],
    response: z.never(),
    errors: [{ status: 'default', schema: problemDetail }, notAuthorizedError],
});

const confirmRevocationEndpoint = makeEndpoint({
    method: 'post',
    path: withOrganismPathSegment('/confirm-revocation'),
    alias: 'confirmRevocation',
    parameters: [
        authorizationHeader,
        {
            name: 'accessionVersions',
            type: 'Body',
            schema: accessionVersionsObject,
        },
    ],
    response: z.never(),
    errors: [{ status: 'default', schema: problemDetail }, { status: 422, schema: problemDetail }, notAuthorizedError],
});

const extractUnprocessedDataEndpoint = makeEndpoint({
    method: 'post',
    path: withOrganismPathSegment('/extract-unprocessed-data'),
    alias: 'extractUnprocessedData',
    parameters: [
        authorizationHeader,
        {
            name: 'numberOfSequenceEntries',
            type: 'Query',
            schema: z.number(),
        },
    ],
    response: z.union([z.string(), unprocessedData]),
    errors: [notAuthorizedError],
});

const submitProcessedDataEndpoint = makeEndpoint({
    method: 'post',
    path: withOrganismPathSegment('/submit-processed-data'),
    alias: 'submitProcessedData',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: z.string(),
        },
    ],
    response: z.never(),
    errors: [{ status: 'default', schema: problemDetail }, { status: 422, schema: problemDetail }, notAuthorizedError],
});

const createGroupEndpoint = makeEndpoint({
    method: 'post',
    path: '/groups',
    alias: 'createGroup',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: z.object({
                groupName: z.string(),
            }),
        },
    ],
    response: z.never(),
    errors: [notAuthorizedError],
});

const addUserToGroupEndpoint = makeEndpoint({
    method: 'post',
    path: '/groups/:groupName/users',
    alias: 'addUserToGroup',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: z.object({
                username: z.string(),
            }),
        },
    ],
    response: z.never(),
    errors: [notAuthorizedError],
});

export const backendApi = makeApi([
    submitEndpoint,
    reviseEndpoint,
    getDataToEditEndpoint,
    revokeSequencesEndpoint,
    submitReviewedSequenceEndpoint,
    getSequencesOfUserEndpoint,
    approveProcessedDataEndpoint,
    deleteSequencesEndpoint,
    confirmRevocationEndpoint,
    extractUnprocessedDataEndpoint,
    submitProcessedDataEndpoint,
    createGroupEndpoint,
    addUserToGroupEndpoint,
]);
