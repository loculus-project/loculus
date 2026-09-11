import {
    useMutation,
    type UseMutationOptions,
    type UseMutationResult,
    useQuery,
    type UseQueryOptions,
    type UseQueryResult,
} from '@tanstack/react-query';
import axios, { isAxiosError } from 'axios';
import z from 'zod';

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
    accessionVersionsFilterWithApprovalScope,
    accessionVersionsFilterWithDeletionScope,
    type DataUseTerms,
    type EditedSequenceEntryData,
    getSequencesResponse,
    type GetSequencesResponse,
    problemDetail,
    type RevocationRequest,
    sequenceEntryToEdit,
    type SequenceEntryToEdit,
    submissionIdMapping,
    type SubmissionIdMapping,
    submitFiles,
    uploadFiles,
} from '../types/backend.ts';
import {
    aggregatedResponse,
    type AggregatedResponse,
    detailsResponse,
    type DetailsResponse,
    lineageDefinition,
    type LineageDefinition,
    type OrderBy,
    sequenceEntryHistory,
    type SequenceEntryHistory,
    type SequenceRequest,
} from '../types/lapis.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import { fastaEntries } from '../utils/parseFasta.ts';
import { isAlignedSequence, isUnalignedSequence, type SequenceType } from '../utils/sequenceTypeHelpers.ts';

/**
 * Retry configuration for LAPIS requests.
 * LAPIS queries are safe to retry even though they use POST, as they only fetch data.
 * This configuration enables automatic retry on transient network errors.
 * Applied automatically by lapisClientHooks wrappers.
 */
const LAPIS_RETRY_OPTIONS = {
    retry: 6,
    retryDelay: (attemptIndex: number) => Math.min(250 * 2 ** attemptIndex, 30000),
};

type SubmitFiles = z.infer<typeof submitFiles>;
type UploadFiles = z.infer<typeof uploadFiles>;
type AccessionVersionsFilterWithApprovalScope = z.infer<typeof accessionVersionsFilterWithApprovalScope>;
type AccessionVersionsFilterWithDeletionScope = z.infer<typeof accessionVersionsFilterWithDeletionScope>;

/**
 * Request body for LAPIS query endpoints. Typed loosely instead of via `LapisBaseRequest`, because the
 * zod `.catchall()` type is incompatible with `orderBy`, see https://github.com/colinhacks/zod/issues/3136
 */
type LapisRequest = {
    limit?: number;
    offset?: number;
    fields?: string[];
    orderBy?: OrderBy[];
} & Record<string, unknown>;

type SeqSetIdAndVersion = { seqSetId: string; seqSetVersion: number };
const seqSetIdAndVersion = z.object({ seqSetId: z.string(), seqSetVersion: z.number() });

type SeqSetRecordInput = { accession: string; type: string; isFocal: boolean };
type CreateSeqSetRequest = { name: string; description?: string; records: SeqSetRecordInput[] };
type UpdateSeqSetRequest = { seqSetId: string; name: string; description?: string; records?: SeqSetRecordInput[] };
type ValidateSeqSetRecordsRequest = { accession?: string; type?: string; isFocal: boolean }[] | undefined;

type RequestConfig<Params = Record<string, never>> = {
    headers?: Record<string, string>;
    params?: Params;
    queries?: Record<string, unknown>;
};

type MutationOptions<TData, TVariables, TContext = unknown> = Omit<
    UseMutationOptions<TData, unknown, TVariables, TContext>,
    'mutationFn' | 'mutationKey'
>;

type QueryOptions<TData> = Omit<UseQueryOptions<TData, unknown, TData>, 'queryKey' | 'queryFn'>;

function toFormData(data: Record<string, unknown>): FormData {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) continue;
        if (value instanceof Blob) {
            formData.append(key, value);
        } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            formData.append(key, String(value));
        } else {
            formData.append(key, JSON.stringify(value));
        }
    }
    return formData;
}

export function backendClientHooks(clientConfig: ClientConfig) {
    const backendUrl = clientConfig.backendUrl;

    return {
        useSubmit<TContext = unknown>(
            config: RequestConfig<{ organism: string }>,
            options: MutationOptions<SubmissionIdMapping[], SubmitFiles, TContext> = {},
        ) {
            return useMutation({
                ...options,
                mutationFn: async (data: SubmitFiles) => {
                    const response = await axios.post(
                        `${backendUrl}/${config.params?.organism}/submit`,
                        toFormData(data),
                        { headers: config.headers },
                    );
                    return z.array(submissionIdMapping).parse(response.data);
                },
            });
        },

        useRevise<TContext = unknown>(
            config: RequestConfig<{ organism: string }>,
            options: MutationOptions<SubmissionIdMapping[], UploadFiles, TContext> = {},
        ) {
            return useMutation({
                ...options,
                mutationFn: async (data: UploadFiles) => {
                    const response = await axios.post(
                        `${backendUrl}/${config.params?.organism}/revise`,
                        toFormData(data),
                        { headers: config.headers },
                    );
                    return z.array(submissionIdMapping).parse(response.data);
                },
            });
        },

        useGetDataToEdit(
            config: RequestConfig<{ organism: string; accession: string; version: number }>,
            options: QueryOptions<SequenceEntryToEdit> = {},
        ) {
            const { organism, accession, version } = config.params ?? {};
            const queryOptions: UseQueryOptions<SequenceEntryToEdit, unknown, SequenceEntryToEdit> = {
                ...options,
                queryKey: ['getDataToEdit', backendUrl, organism, accession, version, config.headers],
                queryFn: async () => {
                    const response = await axios.get(
                        `${backendUrl}/${organism}/get-data-to-edit/${accession}/${version}`,
                        { headers: config.headers },
                    );
                    return sequenceEntryToEdit.parse(response.data);
                },
            };
            return useQuery(queryOptions);
        },

        useRevokeSequences<TContext = unknown>(
            config: RequestConfig<{ organism: string }>,
            options: MutationOptions<SubmissionIdMapping[], RevocationRequest, TContext> = {},
        ) {
            return useMutation({
                ...options,
                mutationFn: async (data: RevocationRequest) => {
                    const response = await axios.post(`${backendUrl}/${config.params?.organism}/revoke`, data, {
                        headers: config.headers,
                    });
                    return z.array(submissionIdMapping).parse(response.data);
                },
            });
        },

        useSubmitReviewedSequence<TContext = unknown>(
            config: RequestConfig<{ organism: string }>,
            options: MutationOptions<void, EditedSequenceEntryData, TContext> = {},
        ) {
            return useMutation({
                ...options,
                mutationFn: async (data: EditedSequenceEntryData) => {
                    await axios.post(`${backendUrl}/${config.params?.organism}/submit-edited-data`, data, {
                        headers: config.headers,
                    });
                },
            });
        },

        useGetSequences(
            config: RequestConfig<{ organism: string }>,
            options: QueryOptions<GetSequencesResponse> & { onError?: (error: unknown) => void } = {},
        ) {
            const organism = config.params?.organism;
            const queryOptions: UseQueryOptions<GetSequencesResponse, unknown, GetSequencesResponse> = {
                ...options,
                queryKey: ['getSequences', backendUrl, organism, config.queries, config.headers],
                queryFn: async () => {
                    const response = await axios.get(`${backendUrl}/${organism}/get-sequences`, {
                        headers: config.headers,
                        params: config.queries,
                    });
                    return getSequencesResponse.parse(response.data);
                },
            };
            return useQuery(queryOptions);
        },

        useApproveProcessedData<TContext = unknown>(
            config: RequestConfig<{ organism: string }>,
            options: MutationOptions<AccessionVersion[], AccessionVersionsFilterWithApprovalScope, TContext> = {},
        ) {
            return useMutation({
                ...options,
                mutationFn: async (data: AccessionVersionsFilterWithApprovalScope) => {
                    const response = await axios.post(
                        `${backendUrl}/${config.params?.organism}/approve-processed-data`,
                        data,
                        { headers: config.headers },
                    );
                    return z.array(accessionVersion).parse(response.data);
                },
            });
        },

        useDeleteSequences<TContext = unknown>(
            config: RequestConfig<{ organism: string }>,
            options: MutationOptions<AccessionVersion[], AccessionVersionsFilterWithDeletionScope, TContext> = {},
        ) {
            return useMutation({
                ...options,
                mutationFn: async (data: AccessionVersionsFilterWithDeletionScope) => {
                    const response = await axios.delete(
                        `${backendUrl}/${config.params?.organism}/delete-sequence-entry-versions`,
                        { headers: config.headers, data },
                    );
                    return z.array(accessionVersion).parse(response.data);
                },
            });
        },

        useSetDataUseTerms<TContext = unknown>(
            config: RequestConfig,
            options: MutationOptions<void, { accessions: string[]; newDataUseTerms: DataUseTerms }, TContext> = {},
        ) {
            return useMutation({
                ...options,
                mutationFn: async (data: { accessions: string[]; newDataUseTerms: DataUseTerms }) => {
                    await axios.put(`${backendUrl}/data-use-terms`, data, { headers: config.headers });
                },
            });
        },
    };
}

export function lapisClientHooks(lapisUrl: string) {
    return {
        useAggregated(): UseMutationResult<AggregatedResponse, unknown, LapisRequest> {
            return useMutation({
                mutationFn: async (request: LapisRequest) => {
                    const response = await axios.post(`${lapisUrl}/sample/aggregated`, request);
                    return aggregatedResponse.parse(response.data);
                },
                ...LAPIS_RETRY_OPTIONS,
            });
        },

        useDetails(): UseMutationResult<DetailsResponse, unknown, LapisRequest> {
            return useMutation({
                mutationFn: async (request: LapisRequest) => {
                    const response = await axios.post(`${lapisUrl}/sample/details`, request);
                    return detailsResponse.parse(response.data);
                },
                ...LAPIS_RETRY_OPTIONS,
            });
        },

        useLineageDefinition(config: RequestConfig<{ column: string }>, options: QueryOptions<LineageDefinition> = {}) {
            const column = config.params?.column;
            const queryOptions: UseQueryOptions<LineageDefinition, unknown, LineageDefinition> = {
                ...options,
                queryKey: ['lineageDefinition', lapisUrl, column],
                queryFn: async () => {
                    const response = await axios.get(`${lapisUrl}/sample/lineageDefinition/${column}`);
                    return lineageDefinition.parse(response.data);
                },
                ...LAPIS_RETRY_OPTIONS,
            };
            return useQuery(queryOptions);
        },

        useGetSequence(accessionVersion: string, sequenceType: SequenceType, useLapisMultiSegmentedEndpoint: boolean) {
            return getSequenceHook(
                lapisUrl,
                {
                    accessionVersion,
                    dataFormat: 'FASTA',
                },
                sequenceType,
                useLapisMultiSegmentedEndpoint,
            );
        },
    };
}

function getSequenceHook(
    lapisUrl: string,
    request: SequenceRequest, // these are request PARAMETERS, not requests
    sequenceType: SequenceType,
    isMultiSegmented: boolean,
) {
    const url = `${lapisUrl}/sample/${getSequenceEndpoint(sequenceType, isMultiSegmented)}`;

    const { data, error, isLoading } = useQuery({
        queryKey: ['lapisSequence', url, request],
        queryFn: async () => {
            const response = await axios.post(url, request);
            return z.string().parse(response.data);
        },
        ...LAPIS_RETRY_OPTIONS,
    });

    if (data === undefined) {
        if (isAxiosError(error)) {
            const maybeProblemDetail = error.response?.data?.error ?? error.response?.data; // eslint-disable-line @typescript-eslint/no-unsafe-member-access

            const problemDetailParseResult = problemDetail.safeParse(maybeProblemDetail);

            if (problemDetailParseResult.success) {
                return { data: null, error: problemDetailParseResult.data, isLoading };
            }
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

function getSequenceEndpoint(sequenceType: SequenceType, isMultiSegmented: boolean): string {
    if (isUnalignedSequence(sequenceType)) {
        return isMultiSegmented
            ? `unalignedNucleotideSequences/${sequenceType.name.lapisName}`
            : 'unalignedNucleotideSequences';
    }

    if (isAlignedSequence(sequenceType)) {
        return isMultiSegmented
            ? `alignedNucleotideSequences/${sequenceType.name.lapisName}`
            : 'alignedNucleotideSequences';
    }

    return `alignedAminoAcidSequences/${sequenceType.name.lapisName}`;
}

export function seqSetCitationClientHooks(clientConfig: ClientConfig) {
    const backendUrl = clientConfig.backendUrl;

    return {
        useCreateSeqSet<TContext = unknown>(
            config: RequestConfig,
            options: MutationOptions<SeqSetIdAndVersion, CreateSeqSetRequest, TContext> = {},
        ) {
            return useMutation({
                ...options,
                mutationFn: async (data: CreateSeqSetRequest) => {
                    const response = await axios.post(`${backendUrl}/create-seqset`, data, {
                        headers: config.headers,
                    });
                    return seqSetIdAndVersion.parse(response.data);
                },
            });
        },

        useUpdateSeqSet<TContext = unknown>(
            config: RequestConfig,
            options: MutationOptions<SeqSetIdAndVersion, UpdateSeqSetRequest, TContext> = {},
        ) {
            return useMutation({
                ...options,
                mutationFn: async (data: UpdateSeqSetRequest) => {
                    const response = await axios.put(`${backendUrl}/update-seqset`, data, {
                        headers: config.headers,
                    });
                    return seqSetIdAndVersion.parse(response.data);
                },
            });
        },

        useValidateSeqSetRecords<TContext = unknown>(
            config: RequestConfig,
            options: MutationOptions<{ valid: boolean }, ValidateSeqSetRecordsRequest, TContext> = {},
        ) {
            return useMutation({
                ...options,
                mutationFn: async (data: ValidateSeqSetRecordsRequest) => {
                    const response = await axios.post(`${backendUrl}/validate-seqset-records`, data, {
                        headers: config.headers,
                    });
                    return z.object({ valid: z.boolean() }).parse(response.data);
                },
            });
        },

        useCreateSeqSetDOI<TContext = unknown>(
            config: RequestConfig<SeqSetIdAndVersion>,
            options: MutationOptions<SeqSetIdAndVersion, void, TContext> = {},
        ) {
            return useMutation({
                ...options,
                mutationFn: async () => {
                    const response = await axios.post(`${backendUrl}/create-seqset-doi`, undefined, {
                        headers: config.headers,
                        params: { seqSetId: config.params?.seqSetId, version: config.params?.seqSetVersion },
                    });
                    return seqSetIdAndVersion.parse(response.data);
                },
            });
        },

        useDeleteSeqSet<TContext = unknown>(
            config: RequestConfig<SeqSetIdAndVersion>,
            options: MutationOptions<void, void, TContext> = {},
        ) {
            return useMutation({
                ...options,
                mutationFn: async () => {
                    await axios.delete(`${backendUrl}/delete-seqset`, {
                        headers: config.headers,
                        params: { seqSetId: config.params?.seqSetId, version: config.params?.seqSetVersion },
                    });
                },
            });
        },
    };
}

export function useSequenceEntryHistory(
    lapisUrl: string,
    accession: string | undefined,
): UseQueryResult<SequenceEntryHistory, Error> {
    return useQuery({
        queryKey: ['sequence-entry-history', lapisUrl, accession],
        queryFn: async (): Promise<SequenceEntryHistory> => {
            const response = await axios.post(`${lapisUrl}/sample/details`, {
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
            });

            const detailsParseResult = detailsResponse.safeParse(response.data);
            if (!detailsParseResult.success) throw new Error('Unexpected LAPIS details response format');
            const parseResult = sequenceEntryHistory.safeParse(detailsParseResult.data.data);
            if (!parseResult.success) throw new Error('Unexpected sequence entry history format');
            return parseResult.data;
        },
        enabled: accession !== undefined,
    });
}
