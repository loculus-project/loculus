import { makeApi, makeEndpoint } from '@zodios/core';
import z from 'zod';

import { authorizationHeader, notAuthorizedError } from './commonApiTypes.ts';
import { authorProfile, datasets, datasetRecords, citedByResult } from '../types/datasetCitation.ts';

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
    path: '/get-user-cited-by-dataset?username=:username',
    alias: 'getUserCitedBy',
    parameters: [authorizationHeader],
    response: citedByResult,
    errors: [notAuthorizedError],
});

const getDatasetCitedByEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-dataset-cited-by-publication?datasetId=:datasetId&version=:version',
    alias: 'getDatasetCitedBy',
    response: citedByResult,
    errors: [notAuthorizedError],
});

const getDatasetEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-dataset?datasetId=:datasetId&version=:version',
    alias: 'getDataset',
    response: datasets,
    errors: [notAuthorizedError],
});

const getDatasetRecordsEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-dataset-records?datasetId=:datasetId&version=:version',
    alias: 'getDatasetRecords',
    response: datasetRecords,
    errors: [notAuthorizedError],
});

const validateDatasetRecords = makeEndpoint({
    method: 'post',
    path: '/validate-dataset-records',
    alias: 'validateDatasetRecords',
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
    parameters: [authorizationHeader],
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

const getAuthorEndpoint = makeEndpoint({
    method: 'get',
    path: '/get-author?username=:username',
    alias: 'getAuthor',
    response: authorProfile,
    errors: [notAuthorizedError],
});

export const datasetCitationApi = makeApi([
    getDatasetsOfUserEndpoint,
    getUserCitedByEndpoint,
    getDatasetCitedByEndpoint,
    getDatasetEndpoint,
    getDatasetRecordsEndpoint,
    validateDatasetRecords,
    createDatasetEndpoint,
    createDatasetDOIEndpoint,
    updateDatasetEndpoint,
    deleteDatasetEndpoint,
    getAuthorEndpoint,
]);
