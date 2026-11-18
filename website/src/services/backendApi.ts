import z from 'zod';

import type { ApiDefinition } from './apiClient.ts';
import { withOrganismPathSegment } from './commonApiTypes.ts';
import {
    accessionVersion,
    accessionVersionsFilterWithApprovalScope,
    accessionVersionsFilterWithDeletionScope,
    dataUseTerms,
    dataUseTermsHistoryEntry,
    editedSequenceEntryData,
    getSequencesResponse,
    revocationRequest,
    sequenceEntryToEdit,
    submissionIdMapping,
    submitFiles,
    unprocessedData,
    uploadFiles,
} from '../types/backend.ts';

export const backendApi = {
    submit: {
        method: 'post',
        path: withOrganismPathSegment('/submit'),
        requestFormat: 'form-data',
        body: submitFiles,
        response: z.array(submissionIdMapping),
    },
    revise: {
        method: 'post',
        path: withOrganismPathSegment('/revise'),
        requestFormat: 'form-data',
        body: uploadFiles,
        response: z.array(submissionIdMapping),
    },
    getDataToEdit: {
        method: 'get',
        path: withOrganismPathSegment('/get-data-to-edit/:accession/:version'),
        response: sequenceEntryToEdit,
    },
    revokeSequences: {
        method: 'post',
        path: withOrganismPathSegment('/revoke'),
        body: revocationRequest,
        response: z.array(submissionIdMapping),
    },
    submitReviewedSequence: {
        method: 'post',
        path: withOrganismPathSegment('/submit-edited-data'),
        body: editedSequenceEntryData,
        response: z.never(),
    },
    getSequences: {
        method: 'get',
        path: withOrganismPathSegment('/get-sequences'),
        queries: z.object({
            includeReviewData: z.boolean().optional(),
            groupIdsFilter: z.string().optional(), // comma separated list of group ids (numbers)
            statusesFilter: z.string().optional(),
            processingResultFilter: z.string().optional(),
            page: z.number().optional(), // 0-indexed
            size: z.number().optional(),
        }),
        response: getSequencesResponse,
    },
    approveProcessedData: {
        method: 'post',
        path: withOrganismPathSegment('/approve-processed-data'),
        body: accessionVersionsFilterWithApprovalScope,
        response: z.array(accessionVersion),
    },
    deleteSequences: {
        method: 'delete',
        path: withOrganismPathSegment('/delete-sequence-entry-versions'),
        body: accessionVersionsFilterWithDeletionScope,
        response: z.array(accessionVersion),
    },
    extractUnprocessedData: {
        method: 'post',
        path: withOrganismPathSegment('/extract-unprocessed-data'),
        queries: z.object({
            numberOfSequenceEntries: z.number(),
            pipelineVersion: z.number(),
        }),
        response: z.union([z.string(), unprocessedData]),
    },
    submitProcessedData: {
        method: 'post',
        path: withOrganismPathSegment('/submit-processed-data'),
        body: z.string(),
        queries: z.object({
            pipelineVersion: z.number(),
        }),
        response: z.never(),
    },
    getDataUseTermsHistory: {
        method: 'get',
        path: '/data-use-terms/:accession',
        response: z.array(dataUseTermsHistoryEntry),
    },
    setDataUseTerms: {
        method: 'put',
        path: '/data-use-terms',
        body: z.object({
            accessions: z.array(z.string()),
            newDataUseTerms: dataUseTerms,
        }),
        response: z.never(),
    },
} as const satisfies ApiDefinition;
