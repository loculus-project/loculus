import { Zodios } from '@zodios/core';
import { ZodiosHooks, type ZodiosHooksInstance } from '@zodios/react';
import axios, { isAxiosError } from 'axios';

import { backendApi } from './backendApi.ts';
import { lapisApi } from './lapisApi.ts';
import { queryApi } from './queryApi.ts';
import { seqSetCitationApi } from './seqSetCitationApi.ts';
import { problemDetail } from '../types/backend.ts';
import type { SequenceRequest } from '../types/lapis.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';
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

type SequenceHooks = Pick<
    ZodiosHooksInstance<typeof lapisApi>,
    | 'useUnalignedNucleotideSequences'
    | 'useUnalignedNucleotideSequencesMultiSegment'
    | 'useAlignedNucleotideSequences'
    | 'useAlignedNucleotideSequencesMultiSegment'
    | 'useAlignedAminoAcidSequences'
>;

export function backendClientHooks(clientConfig: ClientConfig) {
    return new ZodiosHooks('loculus', new Zodios(clientConfig.backendUrl, backendApi));
}

export function lapisClientHooks(lapisUrl: string, queryCurrentUrl?: string, accessToken?: string) {
    const authenticatedAxios = axios.create({
        headers: createAuthorizationHeader(accessToken) ?? {},
    });
    const proxyZodios = new ZodiosHooks(
        'lapis',
        new Zodios(lapisUrl, lapisApi, { transform: false, axiosInstance: authenticatedAxios }),
    );
    const queryZodios = queryCurrentUrl
        ? new ZodiosHooks(
              'lapis-query',
              new Zodios(queryCurrentUrl, queryApi, {
                  transform: false,
                  axiosInstance: authenticatedAxios,
              }),
          )
        : null;
    return {
        // useDetails and useAggregated use the structured QueryController endpoint when available
        useAggregated: () =>
            queryZodios
                ? queryZodios.useAggregated({}, { ...LAPIS_RETRY_OPTIONS })
                : proxyZodios.useAggregated({}, { ...LAPIS_RETRY_OPTIONS }),
        useDetails: () =>
            queryZodios
                ? queryZodios.useDetails({}, { ...LAPIS_RETRY_OPTIONS })
                : proxyZodios.useDetails({}, { ...LAPIS_RETRY_OPTIONS }),
        // lineageDefinition stays at the raw LAPIS proxy; it is reference metadata, not sequence data.
        useLineageDefinition: proxyZodios.useLineageDefinition.bind(proxyZodios),
        useGetSequence(accessionVersion: string, sequenceType: SequenceType, useLapisMultiSegmentedEndpoint: boolean) {
            return getSequenceHook(
                (queryZodios ?? proxyZodios) as SequenceHooks,
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
    hooks: SequenceHooks,
    request: SequenceRequest, // these are request PARAMETERS, not requests
    sequenceType: SequenceType,
    isMultiSegmented: boolean,
) {
    const rawResult = selectSequenceHook(hooks, request, sequenceType, isMultiSegmented);
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

function selectSequenceHook(
    hooks: SequenceHooks,
    request: SequenceRequest,
    sequenceType: SequenceType,
    isMultiSegmented: boolean,
) {
    if (isUnalignedSequence(sequenceType)) {
        return isMultiSegmented
            ? hooks.useUnalignedNucleotideSequencesMultiSegment(request, {
                  params: { segment: sequenceType.name.lapisName },
                  ...LAPIS_RETRY_OPTIONS,
              })
            : hooks.useUnalignedNucleotideSequences(request, {}, { ...LAPIS_RETRY_OPTIONS });
    }

    if (isAlignedSequence(sequenceType)) {
        return isMultiSegmented
            ? hooks.useAlignedNucleotideSequencesMultiSegment(request, {
                  params: { segment: sequenceType.name.lapisName },
                  ...LAPIS_RETRY_OPTIONS,
              })
            : hooks.useAlignedNucleotideSequences(request, {}, { ...LAPIS_RETRY_OPTIONS });
    }

    return hooks.useAlignedAminoAcidSequences(request, {
        params: { gene: sequenceType.name.lapisName },
        ...LAPIS_RETRY_OPTIONS,
    });
}

export function seqSetCitationClientHooks(clientConfig: ClientConfig) {
    return new ZodiosHooks('loculus', new Zodios(clientConfig.backendUrl, seqSetCitationApi));
}
