import { Zodios } from '@zodios/core';
import { ZodiosHooks, type ZodiosHooksInstance } from '@zodios/react';
import { isAxiosError } from 'axios';

import { backendApi } from './backendApi.ts';
import { lapisApi } from './lapisApi.ts';
import { seqSetCitationApi } from './seqSetCitationApi.ts';
import { problemDetail } from '../types/backend.ts';
import type { SequenceRequest } from '../types/lapis.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import { fastaEntries } from '../utils/parseFasta.ts';
import { isAlignedSequence, isUnalignedSequence, type SequenceType } from '../utils/sequenceTypeHelpers.ts';

/**
 * Retry configuration for query-service POSTs.
 * These are POST-shaped reads (no side effects) so retrying transient
 * errors is safe. Applied by every lapisClientHooks wrapper below.
 */
const LAPIS_RETRY_OPTIONS = {
    retry: 6,
    retryDelay: (attemptIndex: number) => Math.min(250 * 2 ** attemptIndex, 30000),
};

export function backendClientHooks(clientConfig: ClientConfig) {
    return new ZodiosHooks('loculus', new Zodios(clientConfig.backendUrl, backendApi));
}

/**
 * @param options.include  Pass `'all'` (or any valid query-service `include=`
 *   value) to opt out of the implicit version-status / revocation defaults.
 *   The search UI passes `'all'` because it manages those defaults itself
 *   via `hiddenFieldValues`. Autocomplete and other narrow views leave it
 *   unset so the defaults apply.
 */
export function lapisClientHooks(queryServiceUrl: string, organism: string, options: { include?: string } = {}) {
    const zodiosHooks = new ZodiosHooks('lapis', new Zodios(queryServiceUrl, lapisApi, { transform: false }));
    const baseQueries = options.include ? ({ organism, include: options.include } as const) : ({ organism } as const);
    return {
        useAggregated: () => zodiosHooks.useAggregated({ queries: baseQueries }, { ...LAPIS_RETRY_OPTIONS }),
        useDetails: () => zodiosHooks.useDetails({ queries: baseQueries }, { ...LAPIS_RETRY_OPTIONS }),
        useLineageDefinition: (config: { queries: { column: string } }) =>
            zodiosHooks.useLineageDefinition({ queries: { ...baseQueries, ...config.queries } }),
        useGetSequence(accessionVersion: string, sequenceType: SequenceType, useLapisMultiSegmentedEndpoint: boolean) {
            return getSequenceHook(
                zodiosHooks,
                {
                    accessionVersion,
                    dataFormat: 'FASTA',
                },
                organism,
                sequenceType,
                useLapisMultiSegmentedEndpoint,
            );
        },
    };
}

function getSequenceHook(
    hooks: ZodiosHooksInstance<typeof lapisApi>,
    request: SequenceRequest, // these are request PARAMETERS, not requests
    organism: string,
    sequenceType: SequenceType,
    isMultiSegmented: boolean,
) {
    const rawResult = selectSequenceHook(hooks, request, organism, sequenceType, isMultiSegmented);
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
    hooks: ZodiosHooksInstance<typeof lapisApi>,
    request: SequenceRequest,
    organism: string,
    sequenceType: SequenceType,
    isMultiSegmented: boolean,
) {
    if (isUnalignedSequence(sequenceType)) {
        return hooks.useUnalignedNucleotideSequences(
            request,
            {
                queries: {
                    organism,
                    ...(isMultiSegmented ? { reference: sequenceType.name.lapisName } : {}),
                },
            },
            { ...LAPIS_RETRY_OPTIONS },
        );
    }

    if (isAlignedSequence(sequenceType)) {
        return hooks.useAlignedNucleotideSequences(
            request,
            {
                queries: {
                    organism,
                    ...(isMultiSegmented ? { reference: sequenceType.name.lapisName } : {}),
                },
            },
            { ...LAPIS_RETRY_OPTIONS },
        );
    }

    return hooks.useAlignedAminoAcidSequences(request, {
        params: { proteinName: sequenceType.name.lapisName },
        queries: { organism },
        ...LAPIS_RETRY_OPTIONS,
    });
}

export function seqSetCitationClientHooks(clientConfig: ClientConfig) {
    return new ZodiosHooks('loculus', new Zodios(clientConfig.backendUrl, seqSetCitationApi));
}
