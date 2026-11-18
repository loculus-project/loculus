import {
    useMutation,
    type UseMutationOptions,
    useQuery,
    type UseQueryOptions,
    type UseQueryResult,
} from '@tanstack/react-query';
import axios, { isAxiosError } from 'axios';
import z from 'zod';

import { apiPath, extractProblemDetail, sendRequest, toFormData } from './apiRequest.ts';
import { fetchLapisAggregated, fetchLapisDetails } from './lapisClientSideApi.ts';
import {
    ACCESSION_FIELD,
    ACCESSION_VERSION_FIELD,
    IS_REVOCATION_FIELD,
    SUBMITTED_AT_FIELD,
    VERSION_FIELD,
    VERSION_STATUS_FIELD,
} from '../settings.ts';
import {
    accessionVersion,
    type AccessionVersion,
    type AccessionVersionsFilterWithApprovalScope,
    type AccessionVersionsFilterWithDeletionScope,
    type EditedSequenceEntryData,
    getSequencesResponse,
    type GetSequencesResponse,
    type RevocationRequest,
    sequenceEntryToEdit,
    type SequenceEntryToEdit,
    type SetDataUseTermsRequest,
    submissionIdMapping,
    type SubmissionIdMapping,
    type SubmitFiles,
    type UploadFiles,
} from '../types/backend.ts';
import {
    type AggregatedResponse,
    detailsResponse,
    type DetailsResponse,
    lineageDefinition,
    type LineageDefinition,
    type LapisRequest,
    sequenceEntryHistory,
    type SequenceEntryHistory,
} from '../types/lapis.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import {
    type CreateSeqSetRequest,
    seqSetIdAndVersion,
    type SeqSetIdAndVersion,
    type UpdateSeqSetRequest,
    type ValidateSeqSetRecordsRequest,
} from '../types/seqSetCitation.ts';
import type { SeqSetRecord } from '../types/seqSetCitation.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';
import { fastaEntries } from '../utils/parseFasta.ts';
import { isAlignedSequence, isUnalignedSequence, type SequenceType } from '../utils/sequenceTypeHelpers.ts';

/**
 * Retry configuration for LAPIS requests.
 * LAPIS queries are safe to retry even though they use POST, as they only fetch data.
 * This configuration enables automatic retry on transient network errors.
 */
const LAPIS_RETRY_OPTIONS = {
    retry: 6,
    retryDelay: (attemptIndex: number) => Math.min(250 * 2 ** attemptIndex, 30000),
};

/**
 * Errors are AxiosErrors for HTTP/network errors and ResponseValidationErrors for unexpected response bodies.
 */
type QueryOptions<TData> = Omit<UseQueryOptions<TData, Error, TData>, 'queryKey' | 'queryFn'>;
type MutationOptions<TData, TVariables> = Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'>;

type OrganismRequestConfig = { organism: string; accessToken: string };

export function backendClientHooks(clientConfig: ClientConfig) {
    const { backendUrl } = clientConfig;

    return {
        useGetDataToEdit(
            {
                organism,
                accessToken,
                accession,
                version,
            }: OrganismRequestConfig & { accession: string; version: number },
            options: QueryOptions<SequenceEntryToEdit> = {},
        ) {
            return useQuery<SequenceEntryToEdit, Error>({
                queryKey: ['getDataToEdit', backendUrl, organism, accession, version, accessToken],
                queryFn: ({ signal }) =>
                    sendRequest(backendUrl, {
                        method: 'get',
                        path: apiPath`/${organism}/get-data-to-edit/${accession}/${version}`,
                        headers: createAuthorizationHeader(accessToken),
                        signal,
                        responseSchema: sequenceEntryToEdit,
                    }),
                ...options,
            });
        },

        useGetSequences(
            { organism, accessToken, queries }: OrganismRequestConfig & { queries: GetSequencesQueries },
            options: QueryOptions<GetSequencesResponse> = {},
        ) {
            return useQuery<GetSequencesResponse, Error>({
                queryKey: ['getSequences', backendUrl, organism, queries, accessToken],
                queryFn: ({ signal }) =>
                    sendRequest(backendUrl, {
                        method: 'get',
                        path: apiPath`/${organism}/get-sequences`,
                        params: queries,
                        headers: createAuthorizationHeader(accessToken),
                        signal,
                        responseSchema: getSequencesResponse,
                    }),
                ...options,
            });
        },

        useSubmit(
            { organism, accessToken }: OrganismRequestConfig,
            options: MutationOptions<SubmissionIdMapping[], SubmitFiles> = {},
        ) {
            return useMutation({
                mutationFn: (files: SubmitFiles) =>
                    sendRequest(backendUrl, {
                        method: 'post',
                        path: apiPath`/${organism}/submit`,
                        data: toFormData(files),
                        headers: createAuthorizationHeader(accessToken),
                        responseSchema: z.array(submissionIdMapping),
                    }),
                ...options,
            });
        },

        useRevise(
            { organism, accessToken }: OrganismRequestConfig,
            options: MutationOptions<SubmissionIdMapping[], UploadFiles> = {},
        ) {
            return useMutation({
                mutationFn: (files: UploadFiles) =>
                    sendRequest(backendUrl, {
                        method: 'post',
                        path: apiPath`/${organism}/revise`,
                        data: toFormData(files),
                        headers: createAuthorizationHeader(accessToken),
                        responseSchema: z.array(submissionIdMapping),
                    }),
                ...options,
            });
        },

        useRevokeSequences(
            { organism, accessToken }: OrganismRequestConfig,
            options: MutationOptions<SubmissionIdMapping[], RevocationRequest> = {},
        ) {
            return useMutation({
                mutationFn: (request: RevocationRequest) =>
                    sendRequest(backendUrl, {
                        method: 'post',
                        path: apiPath`/${organism}/revoke`,
                        data: request,
                        headers: createAuthorizationHeader(accessToken),
                        responseSchema: z.array(submissionIdMapping),
                    }),
                ...options,
            });
        },

        useSubmitReviewedSequence(
            { organism, accessToken }: OrganismRequestConfig,
            options: MutationOptions<void, EditedSequenceEntryData> = {},
        ) {
            return useMutation({
                mutationFn: (data: EditedSequenceEntryData) =>
                    sendRequest(backendUrl, {
                        method: 'post',
                        path: apiPath`/${organism}/submit-edited-data`,
                        data,
                        headers: createAuthorizationHeader(accessToken),
                    }),
                ...options,
            });
        },

        useApproveProcessedData(
            { organism, accessToken }: OrganismRequestConfig,
            options: MutationOptions<AccessionVersion[], AccessionVersionsFilterWithApprovalScope> = {},
        ) {
            return useMutation({
                mutationFn: (filter: AccessionVersionsFilterWithApprovalScope) =>
                    sendRequest(backendUrl, {
                        method: 'post',
                        path: apiPath`/${organism}/approve-processed-data`,
                        data: filter,
                        headers: createAuthorizationHeader(accessToken),
                        responseSchema: z.array(accessionVersion),
                    }),
                ...options,
            });
        },

        useDeleteSequences(
            { organism, accessToken }: OrganismRequestConfig,
            options: MutationOptions<AccessionVersion[], AccessionVersionsFilterWithDeletionScope> = {},
        ) {
            return useMutation({
                mutationFn: (filter: AccessionVersionsFilterWithDeletionScope) =>
                    sendRequest(backendUrl, {
                        method: 'delete',
                        path: apiPath`/${organism}/delete-sequence-entry-versions`,
                        data: filter,
                        headers: createAuthorizationHeader(accessToken),
                        responseSchema: z.array(accessionVersion),
                    }),
                ...options,
            });
        },

        useSetDataUseTerms(
            { accessToken }: { accessToken: string },
            options: MutationOptions<void, SetDataUseTermsRequest> = {},
        ) {
            return useMutation({
                mutationFn: (request: SetDataUseTermsRequest) =>
                    sendRequest(backendUrl, {
                        method: 'put',
                        path: '/data-use-terms',
                        data: request,
                        headers: createAuthorizationHeader(accessToken),
                    }),
                ...options,
            });
        },
    };
}

export type GetSequencesQueries = {
    includeReviewData?: boolean;
    /** comma separated list of group ids */
    groupIdsFilter?: string;
    statusesFilter?: string;
    processingResultFilter?: string;
    /** 0-indexed */
    page?: number;
    size?: number;
};

type SeqSetRequestConfig = { accessToken: string; seqSetId: string; seqSetVersion: number };

export function seqSetCitationClientHooks(clientConfig: ClientConfig) {
    const { backendUrl } = clientConfig;

    return {
        useCreateSeqSet(
            { accessToken }: { accessToken: string },
            options: MutationOptions<SeqSetIdAndVersion, CreateSeqSetRequest> = {},
        ) {
            return useMutation({
                mutationFn: (request: CreateSeqSetRequest) =>
                    sendRequest(backendUrl, {
                        method: 'post',
                        path: '/create-seqset',
                        data: request,
                        headers: createAuthorizationHeader(accessToken),
                        responseSchema: seqSetIdAndVersion,
                    }),
                ...options,
            });
        },

        useUpdateSeqSet(
            { accessToken }: { accessToken: string },
            options: MutationOptions<SeqSetIdAndVersion, UpdateSeqSetRequest> = {},
        ) {
            return useMutation({
                mutationFn: (request: UpdateSeqSetRequest) =>
                    sendRequest(backendUrl, {
                        method: 'put',
                        path: '/update-seqset',
                        data: request,
                        headers: createAuthorizationHeader(accessToken),
                        responseSchema: seqSetIdAndVersion,
                    }),
                ...options,
            });
        },

        useValidateSeqSetRecords(
            { accessToken }: { accessToken: string },
            options: MutationOptions<{ valid: boolean }, ValidateSeqSetRecordsRequest> = {},
        ) {
            return useMutation({
                mutationFn: (records: ValidateSeqSetRecordsRequest) =>
                    sendRequest(backendUrl, {
                        method: 'post',
                        path: '/validate-seqset-records',
                        data: records,
                        headers: createAuthorizationHeader(accessToken),
                        responseSchema: z.object({ valid: z.boolean() }),
                    }),
                ...options,
            });
        },

        useCreateSeqSetDOI(
            { accessToken, seqSetId, seqSetVersion }: SeqSetRequestConfig,
            options: MutationOptions<SeqSetIdAndVersion, void> = {},
        ) {
            return useMutation({
                mutationFn: () =>
                    sendRequest(backendUrl, {
                        method: 'post',
                        path: '/create-seqset-doi',
                        params: { seqSetId, version: seqSetVersion },
                        headers: createAuthorizationHeader(accessToken),
                        responseSchema: seqSetIdAndVersion,
                    }),
                ...options,
            });
        },

        useDeleteSeqSet(
            { accessToken, seqSetId, seqSetVersion }: SeqSetRequestConfig,
            options: MutationOptions<void, void> = {},
        ) {
            return useMutation({
                mutationFn: () =>
                    sendRequest(backendUrl, {
                        method: 'delete',
                        path: '/delete-seqset',
                        params: { seqSetId, version: seqSetVersion },
                        headers: createAuthorizationHeader(accessToken),
                    }),
                ...options,
            });
        },
    };
}

/**
 * Query for all records of a SeqSet version, fetched in the browser. The response is deliberately not validated:
 * validating a large record list with zod costs hundreds of MB (#7752).
 */
export function seqSetRecordsQueryOptions(clientConfig: ClientConfig, seqSetId: string, seqSetVersion: number) {
    return {
        queryKey: ['seqset-records', clientConfig.backendUrl, seqSetId, seqSetVersion],
        queryFn: async (): Promise<SeqSetRecord[]> => {
            const response = await axios.get<SeqSetRecord[]>('/get-seqset-records', {
                baseURL: clientConfig.backendUrl,
                params: { seqSetId, version: seqSetVersion },
            });
            return response.data;
        },
        staleTime: Infinity,
        retry: 1,
    };
}

export function lapisClientHooks(lapisUrl: string) {
    return {
        useAggregated() {
            return useMutation<AggregatedResponse, Error, LapisRequest>({
                mutationFn: (request) => fetchLapisAggregated(lapisUrl, request),
                ...LAPIS_RETRY_OPTIONS,
            });
        },

        useDetails() {
            return useMutation<DetailsResponse, Error, LapisRequest>({
                mutationFn: (request) => fetchLapisDetails(lapisUrl, request),
                ...LAPIS_RETRY_OPTIONS,
            });
        },

        useLineageDefinition(column: string, options: QueryOptions<LineageDefinition> = {}) {
            return useQuery<LineageDefinition, Error>({
                queryKey: ['lineageDefinition', lapisUrl, column],
                queryFn: ({ signal }) =>
                    sendRequest(lapisUrl, {
                        method: 'get',
                        path: apiPath`/sample/lineageDefinition/${column}`,
                        signal,
                        responseSchema: lineageDefinition,
                    }),
                ...options,
            });
        },

        useGetSequence(accessionVersion: string, sequenceType: SequenceType, useLapisMultiSegmentedEndpoint: boolean) {
            const path = sequencesPath(sequenceType, useLapisMultiSegmentedEndpoint);
            const request = { accessionVersion, dataFormat: 'FASTA' };
            const { data, error, isLoading } = useQuery<string, Error>({
                queryKey: ['sequences', lapisUrl, path, request],
                queryFn: ({ signal }) =>
                    sendRequest(lapisUrl, { method: 'post', path, data: request, signal, responseSchema: z.string() }),
                ...LAPIS_RETRY_OPTIONS,
            });
            return parseSequenceResult(data, error, isLoading);
        },
    };
}

function sequencesPath(sequenceType: SequenceType, isMultiSegmented: boolean) {
    const name = sequenceType.name.lapisName;
    if (isUnalignedSequence(sequenceType)) {
        return isMultiSegmented
            ? apiPath`/sample/unalignedNucleotideSequences/${name}`
            : '/sample/unalignedNucleotideSequences';
    }
    if (isAlignedSequence(sequenceType)) {
        return isMultiSegmented
            ? apiPath`/sample/alignedNucleotideSequences/${name}`
            : '/sample/alignedNucleotideSequences';
    }
    return apiPath`/sample/alignedAminoAcidSequences/${name}`;
}

function parseSequenceResult(data: string | undefined, error: Error | null, isLoading: boolean) {
    if (data === undefined) {
        const problem = extractProblemDetail(error);
        if (problem !== undefined) {
            return { data: null, error: problem, isLoading };
        }

        return { data, error, isLoading };
    }

    const parseResult = fastaEntries.safeParse(data);

    if (parseResult.success) {
        return {
            data: parseResult.data.length > 0 ? parseResult.data[0] : null,
            error,
            isLoading,
        };
    }
    return {
        data: undefined,
        error: parseResult.error,
        isLoading,
    };
}

export function useSequenceEntryHistory(
    lapisUrl: string,
    accession: string | undefined,
): UseQueryResult<SequenceEntryHistory, Error> {
    return useQuery({
        queryKey: ['sequence-entry-history', lapisUrl, accession],
        queryFn: async ({ signal }): Promise<SequenceEntryHistory> => {
            const response = await sendRequest(lapisUrl, {
                method: 'post',
                path: '/sample/details',
                data: {
                    accession: accession!,
                    fields: [
                        ACCESSION_VERSION_FIELD,
                        ACCESSION_FIELD,
                        VERSION_FIELD,
                        VERSION_STATUS_FIELD,
                        IS_REVOCATION_FIELD,
                        SUBMITTED_AT_FIELD,
                    ],
                    orderBy: [{ field: VERSION_FIELD, type: 'ascending' }],
                } satisfies LapisRequest,
                signal,
                responseSchema: detailsResponse,
            });

            const parseResult = sequenceEntryHistory.safeParse(response.data);
            if (!parseResult.success) throw new Error('Unexpected sequence entry history format');
            return parseResult.data;
        },
        enabled: accession !== undefined,
    });
}
