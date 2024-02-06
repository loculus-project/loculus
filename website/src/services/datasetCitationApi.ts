import { makeApi, makeEndpoint } from '@zodios/core';
import z from 'zod';

import { authorizationHeader, notAuthorizedError } from './commonApiTypes.ts';
import { authors, datasets, datasetRecords, citedByResult } from '../types/datasetCitation.ts';

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
    parameters: [authorizationHeader],
    response: authors,
    errors: [notAuthorizedError],
});

const createAuthorEndpoint = makeEndpoint({
    method: 'post',
    path: '/create-author',
    alias: 'createAuthor',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: z.object({
                name: z.string(),
                affiliation: z.string().optional(),
                email: z.string().optional(),
                emailVerified: z.boolean().optional(),
            }),
        },
    ],
    response: z.object({
        authorId: z.string(),
    }),
    errors: [notAuthorizedError],
});

const updateAuthorEndpoint = makeEndpoint({
    method: 'put',
    path: '/update-author?authorId=:authorId',
    alias: 'updateAuthor',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: z.object({
                name: z.string(),
                affiliation: z.string().optional(),
                email: z.string().optional(),
                emailVerified: z.boolean().optional(),
            }),
        },
    ],
    response: z.object({
        authorId: z.string(),
    }),
    errors: [notAuthorizedError],
});

export const datasetCitationApi = makeApi([
    getDatasetsOfUserEndpoint,
    getUserCitedByEndpoint,
    getDatasetCitedByEndpoint,
    getDatasetEndpoint,
    getDatasetRecordsEndpoint,
    createDatasetEndpoint,
    createDatasetDOIEndpoint,
    updateDatasetEndpoint,
    deleteDatasetEndpoint,
    getAuthorEndpoint,
    createAuthorEndpoint,
    updateAuthorEndpoint,
]);
