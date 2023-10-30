import { Zodios } from '@zodios/core';
import { ZodiosHooks, type ZodiosHooksInstance } from '@zodios/react';

import { backendApi } from './backendApi.ts';
import { lapisApi } from './lapisApi.ts';
import type { Config } from '../types/config.ts';
import type { LapisBaseRequest } from '../types/lapis.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import { fastaEntries } from '../utils/parseFasta.ts';
import { isAlignedSequence, isUnalignedSequence, type SequenceType } from '../utils/sequenceTypeHelpers.ts';

export function backendClientHooks(clientConfig: ClientConfig) {
    return new ZodiosHooks('pathoplexus', new Zodios(clientConfig.backendUrl, backendApi));
}

export function lapisClientHooks(clientConfig: ClientConfig) {
    const zodiosHooks = new ZodiosHooks('lapis', new Zodios(clientConfig.lapisUrl, lapisApi, { transform: false }));
    return {
        zodiosHooks,
        utilityHooks: {
            useGetSequence(sequenceVersion: string, sequenceType: SequenceType, config: Config) {
                const { data, error, isLoading } = getSequenceHook(
                    zodiosHooks,
                    { [config.schema.primaryKey]: sequenceVersion },
                    sequenceType,
                );

                if (data === undefined) {
                    return { data, error, isLoading };
                }

                const parseResult = fastaEntries.safeParse(data);

                if (parseResult.success) {
                    return {
                        data: parseResult.data[0],
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
    request: LapisBaseRequest,
    sequenceType: SequenceType,
) {
    if (isUnalignedSequence(sequenceType)) {
        return hooks.useUnalignedNucleotideSequences(request);
    }

    if (isAlignedSequence(sequenceType)) {
        return hooks.useAlignedNucleotideSequences(request);
    }

    return hooks.useAminoAcidSequences(request, { params: { gene: sequenceType.name } });
}
