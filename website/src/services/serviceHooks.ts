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

export function backendClientHooks(clientConfig: ClientConfig) {
    return new ZodiosHooks('loculus', new Zodios(clientConfig.backendUrl, backendApi));
}

export function lapisClientHooks(lapisUrl: string) {
    const zodiosHooks = new ZodiosHooks('lapis', new Zodios(lapisUrl, lapisApi, { transform: false }));
    return {
        zodiosHooks,
        utilityHooks: {
            useGetSequence(accessionVersion: string, sequenceType: SequenceType, isMultiSegmented: boolean) {
                const { data, error, isLoading } = getSequenceHook(
                    zodiosHooks,
                    {
                        accessionVersion,
                        dataFormat: 'FASTA',
                    },
                    sequenceType,
                    isMultiSegmented,
                );

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
            },
        },
    };
}

function getSequenceHook(
    hooks: ZodiosHooksInstance<typeof lapisApi>,
    request: SequenceRequest,
    sequenceType: SequenceType,
    isMultiSegmented: boolean,
) {
    if (isUnalignedSequence(sequenceType)) {
        return isMultiSegmented
            ? hooks.useUnalignedNucleotideSequencesMultiSegment(request, {
                  params: { segment: sequenceType.name.lapisName },
              })
            : hooks.useUnalignedNucleotideSequences(request);
    }

    if (isAlignedSequence(sequenceType)) {
        return isMultiSegmented
            ? hooks.useAlignedNucleotideSequencesMultiSegment(request, {
                  params: { segment: sequenceType.name.lapisName },
              })
            : hooks.useAlignedNucleotideSequences(request);
    }

    return hooks.useAlignedAminoAcidSequences(request, { params: { gene: sequenceType.name.lapisName } });
}

export function seqSetCitationClientHooks(clientConfig: ClientConfig) {
    return new ZodiosHooks('loculus', new Zodios(clientConfig.backendUrl, seqSetCitationApi));
}
