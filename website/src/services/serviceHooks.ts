import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { ApiClient } from './apiClient.ts';
import { makeMutationHook, makeQueryHook } from './apiHooks.ts';
import { backendApi } from './backendApi.ts';
import { lapisApi } from './lapisApi.ts';
import { seqSetCitationApi } from './seqSetCitationApi.ts';
import {
    ACCESSION_FIELD,
    ACCESSION_VERSION_FIELD,
    IS_REVOCATION_FIELD,
    SUBMITTED_AT_FIELD,
    VERSION_FIELD,
    VERSION_STATUS_FIELD,
} from '../settings.ts';
import { problemDetail } from '../types/backend.ts';
import { sequenceEntryHistory, type SequenceEntryHistory, type SequenceRequest } from '../types/lapis.ts';
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

export function backendClientHooks(clientConfig: ClientConfig) {
    const client = new ApiClient(clientConfig.backendUrl, backendApi);
    return {
        useGetDataToEdit: makeQueryHook(client, 'getDataToEdit'),
        useGetSequences: makeQueryHook(client, 'getSequences'),
        useSubmit: makeMutationHook(client, 'submit'),
        useRevise: makeMutationHook(client, 'revise'),
        useRevokeSequences: makeMutationHook(client, 'revokeSequences'),
        useSubmitReviewedSequence: makeMutationHook(client, 'submitReviewedSequence'),
        useApproveProcessedData: makeMutationHook(client, 'approveProcessedData'),
        useDeleteSequences: makeMutationHook(client, 'deleteSequences'),
        useSetDataUseTerms: makeMutationHook(client, 'setDataUseTerms'),
    };
}

export function seqSetCitationClientHooks(clientConfig: ClientConfig) {
    const client = new ApiClient(clientConfig.backendUrl, seqSetCitationApi);
    return {
        useCreateSeqSet: makeMutationHook(client, 'createSeqSet'),
        useUpdateSeqSet: makeMutationHook(client, 'updateSeqSet'),
        useValidateSeqSetRecords: makeMutationHook(client, 'validateSeqSetRecords'),
        useCreateSeqSetDOI: makeMutationHook(client, 'createSeqSetDOI'),
        useDeleteSeqSet: makeMutationHook(client, 'deleteSeqSet'),
    };
}

function createLapisClient(lapisUrl: string) {
    return new ApiClient(lapisUrl, lapisApi, { transform: false });
}

type LapisClient = ReturnType<typeof createLapisClient>;

export function lapisClientHooks(lapisUrl: string) {
    const client = createLapisClient(lapisUrl);
    const useAggregated = makeMutationHook(client, 'aggregated');
    const useDetails = makeMutationHook(client, 'details');
    const useLineageDefinition = makeQueryHook(client, 'lineageDefinition');
    return {
        // All LAPIS hooks must include retry options manually to enable retries
        useAggregated: () => useAggregated({}, { ...LAPIS_RETRY_OPTIONS }),
        useDetails: () => useDetails({}, { ...LAPIS_RETRY_OPTIONS }),
        useLineageDefinition,
        useGetSequence(accessionVersion: string, sequenceType: SequenceType, useLapisMultiSegmentedEndpoint: boolean) {
            return useSequence(
                client,
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

function useSequence(
    client: LapisClient,
    request: SequenceRequest, // these are request PARAMETERS, not requests
    sequenceType: SequenceType,
    isMultiSegmented: boolean,
) {
    const rawResult = useSequenceQuery(client, request, sequenceType, isMultiSegmented);
    const { data, error, isLoading } = rawResult;

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

function useSequenceQuery(
    client: LapisClient,
    request: SequenceRequest,
    sequenceType: SequenceType,
    isMultiSegmented: boolean,
) {
    let alias: keyof typeof lapisApi;
    let params: Record<string, string> | undefined;
    if (isUnalignedSequence(sequenceType)) {
        alias = isMultiSegmented ? 'unalignedNucleotideSequencesMultiSegment' : 'unalignedNucleotideSequences';
        params = isMultiSegmented ? { segment: sequenceType.name.lapisName } : undefined;
    } else if (isAlignedSequence(sequenceType)) {
        alias = isMultiSegmented ? 'alignedNucleotideSequencesMultiSegment' : 'alignedNucleotideSequences';
        params = isMultiSegmented ? { segment: sequenceType.name.lapisName } : undefined;
    } else {
        alias = 'alignedAminoAcidSequences';
        params = { gene: sequenceType.name.lapisName };
    }

    return useQuery({
        queryKey: [client.baseUrl, alias, { params, body: request }],
        queryFn: ({ signal }) =>
            // the path params are guaranteed to match the alias by the branches above
            client.request(alias as 'alignedAminoAcidSequences', {
                body: request,
                params: params as { gene: string },
                signal,
            }),
        ...LAPIS_RETRY_OPTIONS,
    });
}

export function useSequenceEntryHistory(
    lapisUrl: string,
    accession: string | undefined,
): UseQueryResult<SequenceEntryHistory, Error> {
    return useQuery({
        queryKey: ['sequence-entry-history', lapisUrl, accession],
        queryFn: async (): Promise<SequenceEntryHistory> => {
            const client = createLapisClient(lapisUrl);

            const response = await client.request('details', {
                // @ts-expect-error Zod issue: https://github.com/colinhacks/zod/issues/3136
                body: {
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
                },
            });

            const parseResult = sequenceEntryHistory.safeParse(response.data);
            if (!parseResult.success) throw new Error('Unexpected sequence entry history format');
            return parseResult.data;
        },
        enabled: accession !== undefined,
    });
}
