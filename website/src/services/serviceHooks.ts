import { useMutation, useQuery } from '@tanstack/react-query';
import axios, { isAxiosError } from 'axios';
import { useEffect } from 'react';
import z from 'zod';

import {
    accessionVersion,
    getSequencesResponse,
    problemDetail,
    sequenceEntryToEdit,
    submissionIdMapping,
    type UploadFiles,
} from '../types/backend.ts';
import { aggregatedResponse, detailsResponse, lineageDefinition, type SequenceRequest } from '../types/lapis.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import { fastaEntries } from '../utils/parseFasta.ts';
import { isAlignedSequence, isUnalignedSequence, type SequenceType } from '../utils/sequenceTypeHelpers.ts';

/**
 * Retry configuration for LAPIS mutations.
 * LAPIS queries are safe to retry even though they use POST, as they only fetch data.
 * This configuration enables automatic retry on transient network errors.
 * Applied automatically by lapisClientHooks wrappers.
 */
const LAPIS_RETRY_OPTIONS = {
    retry: 6,
    retryDelay: (attemptIndex: number) => Math.min(250 * 2 ** attemptIndex, 30000),
};

const stringifyFileMapping = (data: UploadFiles) => {
    const { fileMapping, ...rest } = data;
    return fileMapping !== undefined ? { ...rest, fileMapping: JSON.stringify(fileMapping) } : rest;
};

function toFormData(data: Record<string, unknown>): FormData {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) continue;
        if (value instanceof File || value instanceof Blob) {
            formData.append(key, value);
        } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            formData.append(key, String(value));
        } else {
            formData.append(key, JSON.stringify(value));
        }
    }
    return formData;
}

type MutationConfig = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSuccess?: (data: any) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError?: (error: unknown) => any;
};
type QueryConfig = { enabled?: boolean; initialData?: unknown; refetchInterval?: number };
type BackendHookConfig = {
    headers?: Record<string, string>;
    params?: Record<string, unknown>;
    queries?: Record<string, unknown>;
};

export function backendClientHooks(clientConfig: ClientConfig) {
    const backendUrl = clientConfig.backendUrl;

    return {
        useSubmit(config: BackendHookConfig, options: MutationConfig = {}) {
            return useMutation({
                mutationFn: async (data: unknown) => {
                    const organism = config.params?.organism;
                    const transformed = stringifyFileMapping(data as UploadFiles);
                    const formData = toFormData(transformed as Record<string, unknown>);
                    const response = await axios.post(`${backendUrl}/${organism}/submit`, formData, {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        headers: { ...config.headers, 'Content-Type': 'multipart/form-data' },
                    });
                    return z.array(submissionIdMapping).parse(response.data);
                },
                onSuccess: options.onSuccess,
                onError: options.onError,
            });
        },

        useRevise(config: BackendHookConfig, options: MutationConfig = {}) {
            return useMutation({
                mutationFn: async (data: unknown) => {
                    const organism = config.params?.organism;
                    const transformed = stringifyFileMapping(data as UploadFiles);
                    const formData = toFormData(transformed as Record<string, unknown>);
                    const response = await axios.post(`${backendUrl}/${organism}/revise`, formData, {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        headers: { ...config.headers, 'Content-Type': 'multipart/form-data' },
                    });
                    return z.array(submissionIdMapping).parse(response.data);
                },
                onSuccess: options.onSuccess,
                onError: options.onError,
            });
        },

        useGetDataToEdit(config: BackendHookConfig, options: QueryConfig = {}) {
            const { organism, accession, version } = config.params ?? {};
            return useQuery({
                queryKey: ['getDataToEdit', backendUrl, organism, accession, version],
                queryFn: async () => {
                    const response = await axios.get(
                        `${backendUrl}/${organism}/get-data-to-edit/${accession}/${version}`,
                        { headers: config.headers },
                    );
                    return sequenceEntryToEdit.parse(response.data);
                },
                enabled: options.enabled,
                initialData: options.initialData as z.infer<typeof sequenceEntryToEdit> | undefined,
            });
        },

        useRevokeSequences(config: BackendHookConfig, options: MutationConfig = {}) {
            return useMutation({
                mutationFn: async (data: unknown) => {
                    const organism = config.params?.organism;
                    const response = await axios.post(`${backendUrl}/${organism}/revoke`, data, {
                        headers: config.headers,
                    });
                    return z.array(submissionIdMapping).parse(response.data);
                },
                onSuccess: options.onSuccess,
                onError: options.onError,
            });
        },

        useSubmitReviewedSequence(config: BackendHookConfig, options: MutationConfig = {}) {
            return useMutation({
                mutationFn: async (data: unknown) => {
                    const organism = config.params?.organism;
                    await axios.post(`${backendUrl}/${organism}/submit-edited-data`, data, {
                        headers: config.headers,
                    });
                },
                onSuccess: options.onSuccess,
                onError: options.onError,
            });
        },

        useGetSequences(config: BackendHookConfig, options: QueryConfig & { onError?: (error: unknown) => void } = {}) {
            const { organism } = config.params ?? {};
            return useQuery({
                queryKey: ['getSequences', backendUrl, organism, config.queries],
                queryFn: async () => {
                    const response = await axios.get(`${backendUrl}/${organism}/get-sequences`, {
                        headers: config.headers,
                        params: config.queries,
                    });
                    return getSequencesResponse.parse(response.data);
                },
                refetchInterval: options.refetchInterval,
                meta: { onError: options.onError },
            });
        },

        useApproveProcessedData(config: BackendHookConfig, options: MutationConfig = {}) {
            return useMutation({
                mutationFn: async (data: unknown) => {
                    const organism = config.params?.organism;
                    const response = await axios.post(`${backendUrl}/${organism}/approve-processed-data`, data, {
                        headers: config.headers,
                    });
                    return z.array(accessionVersion).parse(response.data);
                },
                onSuccess: options.onSuccess,
                onError: options.onError,
            });
        },

        useDeleteSequences(config: BackendHookConfig, options: MutationConfig = {}) {
            return useMutation({
                mutationFn: async (data: unknown) => {
                    const organism = config.params?.organism;
                    const response = await axios.delete(`${backendUrl}/${organism}/delete-sequence-entry-versions`, {
                        headers: config.headers,
                        data,
                    });
                    return z.array(accessionVersion).parse(response.data);
                },
                onSuccess: options.onSuccess,
                onError: options.onError,
            });
        },

        useSetDataUseTerms(config: BackendHookConfig, options: MutationConfig = {}) {
            return useMutation({
                mutationFn: async (data: unknown) => {
                    await axios.put(`${backendUrl}/data-use-terms`, data, {
                        headers: config.headers,
                    });
                },
                onSuccess: options.onSuccess,
                onError: options.onError,
            });
        },
    };
}

export function lapisClientHooks(lapisUrl: string) {
    return {
        useAggregated() {
            return useMutation({
                mutationFn: async (data: unknown) => {
                    const response = await axios.post(`${lapisUrl}/sample/aggregated`, data);
                    return aggregatedResponse.parse(response.data);
                },
                ...LAPIS_RETRY_OPTIONS,
            });
        },

        useDetails() {
            return useMutation({
                mutationFn: async (data: unknown) => {
                    const response = await axios.post(`${lapisUrl}/sample/details`, data);
                    return detailsResponse.parse(response.data);
                },
                ...LAPIS_RETRY_OPTIONS,
            });
        },

        useLineageDefinition(config?: { params?: { column: string } }, _options?: Record<string, unknown>) {
            const column = config?.params?.column;
            return useQuery({
                queryKey: ['lineageDefinition', lapisUrl, column],
                queryFn: async () => {
                    const response = await axios.get(`${lapisUrl}/sample/lineageDefinition/${column}`);
                    return lineageDefinition.parse(response.data);
                },
                enabled: column !== undefined,
            });
        },

        useGetSequence(accessionVersion: string, sequenceType: SequenceType, useLapisMultiSegmentedEndpoint: boolean) {
            return getSequenceHook(lapisUrl, accessionVersion, sequenceType, useLapisMultiSegmentedEndpoint);
        },
    };
}

function getSequenceHook(
    lapisUrl: string,
    accessionVersion: string,
    sequenceType: SequenceType,
    isMultiSegmented: boolean,
) {
    const endpoint = getSequenceEndpoint(sequenceType, isMultiSegmented);
    const url = `${lapisUrl}/sample/${endpoint}`;

    const result = useMutation({
        mutationFn: async (request: SequenceRequest) => {
            const response = await axios.post(url, request);
            return response.data as string;
        },
        ...LAPIS_RETRY_OPTIONS,
    });

    // Auto-trigger the mutation on mount
    useEffect(() => {
        result.mutate({
            accessionVersion,
            dataFormat: 'FASTA',
        });
    }, [url, accessionVersion]);

    const { data, error, isPending } = result;

    if (data === undefined) {
        if (isAxiosError(error)) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const maybeProblemDetail = error.response?.data?.error ?? error.response?.data;

            const problemDetailParseResult = problemDetail.safeParse(maybeProblemDetail);

            if (problemDetailParseResult.success) {
                return { data: null, error: problemDetailParseResult.data, isLoading: isPending };
            }
        }

        return { data, error, isLoading: isPending };
    }

    const parseResult = fastaEntries.safeParse(data);

    if (parseResult.success) {
        return {
            data: parseResult.data.length > 0 ? parseResult.data[0] : null,
            error,
            isLoading: isPending,
        };
    }
    return {
        data: undefined,
        error: parseResult.error,
        isLoading: isPending,
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
    const baseUrl = clientConfig.backendUrl;

    return {
        useCreateSeqSet(config: BackendHookConfig, options: MutationConfig = {}) {
            return useMutation({
                mutationFn: async (data: unknown) => {
                    const response = await axios.post(`${baseUrl}/create-seqset`, data, {
                        headers: config.headers,
                    });
                    return z.object({ seqSetId: z.string(), seqSetVersion: z.number() }).parse(response.data);
                },
                onSuccess: options.onSuccess,
                onError: options.onError,
            });
        },

        useUpdateSeqSet(config: BackendHookConfig, options: MutationConfig = {}) {
            return useMutation({
                mutationFn: async (data: unknown) => {
                    const response = await axios.put(`${baseUrl}/update-seqset`, data, {
                        headers: config.headers,
                    });
                    return z.object({ seqSetId: z.string(), seqSetVersion: z.number() }).parse(response.data);
                },
                onSuccess: options.onSuccess,
                onError: options.onError,
            });
        },

        useValidateSeqSetRecords(config: BackendHookConfig, options: MutationConfig = {}) {
            return useMutation({
                mutationFn: async (data: unknown) => {
                    const response = await axios.post(`${baseUrl}/validate-seqset-records`, data, {
                        headers: config.headers,
                    });
                    return z.object({ valid: z.boolean() }).parse(response.data);
                },
                onSuccess: options.onSuccess,
                onError: options.onError,
            });
        },

        useCreateSeqSetDOI(config: BackendHookConfig, options: MutationConfig = {}) {
            return useMutation({
                mutationFn: async () => {
                    const { seqSetId, seqSetVersion } = config.params ?? {};
                    const response = await axios.post(
                        `${baseUrl}/create-seqset-doi?seqSetId=${seqSetId}&version=${seqSetVersion}`,
                        undefined,
                        { headers: config.headers },
                    );
                    return z.object({ seqSetId: z.string(), seqSetVersion: z.number() }).parse(response.data);
                },
                onSuccess: options.onSuccess,
                onError: options.onError,
            });
        },

        useDeleteSeqSet(config: BackendHookConfig, options: MutationConfig = {}) {
            return useMutation({
                mutationFn: async () => {
                    const { seqSetId, seqSetVersion } = config.params ?? {};
                    await axios.delete(`${baseUrl}/delete-seqset?seqSetId=${seqSetId}&version=${seqSetVersion}`, {
                        headers: config.headers,
                    });
                },
                onSuccess: options.onSuccess,
                onError: options.onError,
            });
        },
    };
}
