import { makeApi, makeEndpoint } from '@zodios/core';
import z from 'zod';

import { problemDetail } from '../types/backend.ts';
import {
    actionResponse,
    errorItem,
    healthResponse,
    paginatedErrors,
    paginatedSubmissions,
    previewResponse,
    submissionDetail,
    submitResponse,
} from '../types/enaDeposition.ts';

const healthEndpoint = makeEndpoint({
    method: 'get',
    path: '/api/health',
    alias: 'health',
    response: healthResponse,
});

const getSubmissionsEndpoint = makeEndpoint({
    method: 'get',
    path: '/api/submissions',
    alias: 'getSubmissions',
    parameters: [
        { name: 'status', type: 'Query', schema: z.string().optional() },
        { name: 'organism', type: 'Query', schema: z.string().optional() },
        { name: 'group_id', type: 'Query', schema: z.number().optional() },
        { name: 'page', type: 'Query', schema: z.number().optional() },
        { name: 'size', type: 'Query', schema: z.number().optional() },
    ],
    response: paginatedSubmissions,
    errors: [{ status: 'default', schema: problemDetail }],
});

const getSubmissionDetailEndpoint = makeEndpoint({
    method: 'get',
    path: '/api/submissions/:accession/:version',
    alias: 'getSubmissionDetail',
    response: submissionDetail,
    errors: [
        { status: 'default', schema: problemDetail },
        { status: 404, schema: problemDetail },
    ],
});

const generatePreviewEndpoint = makeEndpoint({
    method: 'post',
    path: '/api/submissions/preview',
    alias: 'generatePreview',
    parameters: [
        {
            name: 'body',
            type: 'Body',
            schema: z.object({ accessions: z.array(z.string()) }),
        },
    ],
    response: previewResponse,
    errors: [{ status: 'default', schema: problemDetail }],
});

const submitToEnaEndpoint = makeEndpoint({
    method: 'post',
    path: '/api/submissions/submit',
    alias: 'submitToEna',
    parameters: [
        {
            name: 'body',
            type: 'Body',
            schema: z.object({
                submissions: z.array(
                    z.object({
                        accession: z.string(),
                        version: z.number(),
                        organism: z.string(),
                        group_id: z.number(),
                        metadata: z.record(z.unknown()),
                        unaligned_nucleotide_sequences: z.record(z.string().nullable()),
                    }),
                ),
            }),
        },
    ],
    response: submitResponse,
    errors: [{ status: 'default', schema: problemDetail }],
});

const getErrorsEndpoint = makeEndpoint({
    method: 'get',
    path: '/api/errors',
    alias: 'getErrors',
    parameters: [
        { name: 'table', type: 'Query', schema: z.string().optional() },
        { name: 'organism', type: 'Query', schema: z.string().optional() },
        { name: 'group_id', type: 'Query', schema: z.number().optional() },
        { name: 'page', type: 'Query', schema: z.number().optional() },
        { name: 'size', type: 'Query', schema: z.number().optional() },
    ],
    response: paginatedErrors,
    errors: [{ status: 'default', schema: problemDetail }],
});

const getErrorDetailEndpoint = makeEndpoint({
    method: 'get',
    path: '/api/errors/:accession/:version',
    alias: 'getErrorDetail',
    response: errorItem,
    errors: [
        { status: 'default', schema: problemDetail },
        { status: 404, schema: problemDetail },
    ],
});

const retrySubmissionEndpoint = makeEndpoint({
    method: 'post',
    path: '/api/errors/:accession/:version/retry',
    alias: 'retrySubmission',
    parameters: [
        {
            name: 'body',
            type: 'Body',
            schema: z.object({ edited_metadata: z.record(z.unknown()).optional() }).optional(),
        },
    ],
    response: actionResponse,
    errors: [
        { status: 'default', schema: problemDetail },
        { status: 404, schema: problemDetail },
        { status: 400, schema: problemDetail },
    ],
});

export const enaDepositionApi = makeApi([
    healthEndpoint,
    getSubmissionsEndpoint,
    getSubmissionDetailEndpoint,
    generatePreviewEndpoint,
    submitToEnaEndpoint,
    getErrorsEndpoint,
    getErrorDetailEndpoint,
    retrySubmissionEndpoint,
]);
