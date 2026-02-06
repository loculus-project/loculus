import { makeApi, makeEndpoint } from '@zodios/core';
import z from 'zod';

import { authorizationHeader, notAuthorizedError, withOrganismPathSegment } from './commonApiTypes.ts';
import {
    accessionVersion,
    accessionVersionsFilterWithApprovalScope,
    accessionVersionsFilterWithDeletionScope,
    dataUseTerms,
    dataUseTermsHistoryEntry,
    editedSequenceEntryData,
    getSequencesResponse,
    problemDetail,
    revocationRequest,
    sequenceEntryToEdit,
    submissionIdMapping,
    submitFiles,
    unprocessedData,
    type UploadFiles,
    uploadFiles,
} from '../types/backend.ts';

const stringifyFileMapping = (data: UploadFiles) => {
    const { fileMapping, ...rest } = data;
    return fileMapping !== undefined ? { ...rest, fileMapping: JSON.stringify(fileMapping) } : rest;
};

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
            schema: submitFiles.transform(stringifyFileMapping),
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
            schema: uploadFiles.transform(stringifyFileMapping),
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
            name: 'data',
            type: 'Body',
            schema: revocationRequest,
        },
    ],
    response: z.array(submissionIdMapping),
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
            schema: editedSequenceEntryData,
        },
    ],
    response: z.never(),
    errors: [notAuthorizedError],
});

const getSequencesEndpoint = makeEndpoint({
    method: 'get',
    path: withOrganismPathSegment('/get-sequences'),
    alias: 'getSequences',
    parameters: [
        authorizationHeader,
        {
            name: 'groupIdsFilter',
            type: 'Query',
            schema: z.string().optional(), // comma separated list of group ids (numbers)
        },
        {
            name: 'statusesFilter',
            type: 'Query',
            schema: z.string().optional(),
        },
        {
            name: 'processingResultFilter',
            type: 'Query',
            schema: z.string().optional(),
        },
        {
            name: 'page', // 0-indexed
            type: 'Query',
            schema: z.number().optional(),
        },
        {
            name: 'size',
            type: 'Query',
            schema: z.number().optional(),
        },
    ],
    response: getSequencesResponse,
    errors: [notAuthorizedError, { status: 404, schema: problemDetail }],
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
            schema: accessionVersionsFilterWithApprovalScope,
        },
    ],
    response: z.array(accessionVersion),
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
            schema: accessionVersionsFilterWithDeletionScope,
        },
    ],
    response: z.array(accessionVersion),
    errors: [{ status: 'default', schema: problemDetail }, notAuthorizedError],
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
        {
            name: 'pipelineVersion',
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
        {
            name: 'pipelineVersion',
            type: 'Query',
            schema: z.number(),
        },
    ],
    response: z.never(),
    errors: [{ status: 'default', schema: problemDetail }, { status: 422, schema: problemDetail }, notAuthorizedError],
});

const getDataUseTermsHistoryEndpoint = makeEndpoint({
    method: 'get',
    path: '/data-use-terms/:accession',
    alias: 'getDataUseTermsHistory',
    response: z.array(dataUseTermsHistoryEntry),
    errors: [
        { status: 'default', schema: problemDetail },
        { status: 404, schema: problemDetail },
    ],
});

const setDataUseTerms = makeEndpoint({
    method: 'put',
    path: '/data-use-terms',
    alias: 'setDataUseTerms',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: z.object({
                accessions: z.array(z.string()),
                newDataUseTerms: dataUseTerms,
            }),
        },
    ],
    response: z.never(),
    errors: [
        { status: 'default', schema: problemDetail },
        { status: 404, schema: problemDetail },
    ],
});

export const backendApi = makeApi([
    submitEndpoint,
    reviseEndpoint,
    getDataToEditEndpoint,
    revokeSequencesEndpoint,
    submitReviewedSequenceEndpoint,
    getSequencesEndpoint,
    approveProcessedDataEndpoint,
    deleteSequencesEndpoint,
    extractUnprocessedDataEndpoint,
    submitProcessedDataEndpoint,
    getDataUseTermsHistoryEndpoint,
    setDataUseTerms,
]);
