import { makeApi, makeEndpoint } from '@zodios/core';
import z from 'zod';

import { authorizationHeader, notAuthorizedError, withOrganismPathSegment } from './commonApiTypes.ts';
import {
    accessions,
    accessionVersionsObject,
    problemDetail,
    sequenceEntryStatus,
    sequenceEntryToEdit,
    submissionIdMapping,
    submitFiles,
    unprocessedData,
    uploadFiles,
} from '../types/backend.ts';
import { datasets, datasetRecords, citedByResult } from '../types/datasets.ts';

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

const getDatasetsOfUserEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-datasets-of-user',
    alias: 'getDatasetsOfUser',
    parameters: [authorizationHeader],
    response: datasets,
    errors: [notAuthorizedError],
});

const getUserCitedByEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-user-cited-by?username=:username',
    alias: 'getUserCitedBy',
    parameters: [authorizationHeader],
    response: citedByResult,
    errors: [notAuthorizedError],
});

const getDatasetEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-dataset?datasetId=:datasetId&version=:version',
    alias: 'getDataset',
    parameters: [authorizationHeader],
    response: datasets,
    errors: [notAuthorizedError],
});

const getDatasetRecordsEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-dataset-records?datasetId=:datasetId&version=:version',
    alias: 'getDatasetRecords',
    parameters: [authorizationHeader],
    response: datasetRecords,
    errors: [notAuthorizedError],
});

const createDatasetEndpoint = makeEndpoint({
    method: 'post',
    path: '/create-dataset',
    alias: 'createDataset',
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
        datasetId: z.string(),
        datasetVersion: z.number(),
    }),
    errors: [notAuthorizedError],
});

const createDatasetDOIEndpoint = makeEndpoint({
    method: 'post',
    path: '/create-dataset-doi?datasetId=:datasetId&version=:datasetVersion',
    alias: 'createDatasetDOI',
    parameters: [
        authorizationHeader,
    ],
    response: z.object({
        datasetId: z.string(),
        datasetVersion: z.number(),
    }),
    errors: [notAuthorizedError],
});

const updateDatasetEndpoint = makeEndpoint({
    method: 'put',
    path: '/update-dataset',
    alias: 'updateDataset',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: z.object({
                datasetId: z.string(),
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
        datasetId: z.string(),
        datasetVersion: z.number(),
    }),
    errors: [notAuthorizedError],
});

const deleteDatasetEndpoint = makeEndpoint({
    method: 'delete',
    path: '/delete-dataset?datasetId=:datasetId&version=:datasetVersion',
    alias: 'deleteDataset',
    parameters: [authorizationHeader],
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
    getDatasetsOfUserEndpoint,
    getUserCitedByEndpoint,
    getDatasetEndpoint,
    getDatasetRecordsEndpoint,
    createDatasetEndpoint,
    createDatasetDOIEndpoint,
    updateDatasetEndpoint,
    deleteDatasetEndpoint,
]);
