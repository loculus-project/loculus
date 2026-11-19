import { useMutation, type UseMutationOptions, useQuery, type UseQueryOptions } from '@tanstack/react-query';

import type { RequestOptions } from '../services/backendApi.ts';
import { lapisApi, type LapisApi } from '../services/lapisApi.ts';

export type LapisEndpoint = keyof LapisApi;
export type LapisParams<K extends LapisEndpoint> = Parameters<LapisApi[K]>[0];
export type LapisData<K extends LapisEndpoint> = Awaited<ReturnType<LapisApi[K]>>;

export type LapisQueryOptions<K extends LapisEndpoint> = Omit<
    UseQueryOptions<LapisData<K>, Error>,
    'queryKey' | 'queryFn'
>;
export type LapisMutationOptions<K extends LapisEndpoint> = Omit<
    UseMutationOptions<LapisData<K>, Error, LapisParams<K>>,
    'mutationFn'
>;

/**
 * LAPIS queries are safe to retry even though they use POST, as they only fetch data.
 * This enables automatic retry on transient network errors.
 */
export const LAPIS_RETRY_OPTIONS = {
    retry: 6,
    retryDelay: (attemptIndex: number) => Math.min(250 * 2 ** attemptIndex, 30000),
};

function callEndpoint<K extends LapisEndpoint>(
    lapisUrl: string,
    endpoint: K,
    params: LapisParams<K>,
    options: RequestOptions = {},
): Promise<LapisData<K>> {
    const fn = lapisApi(lapisUrl)[endpoint] as (
        params: LapisParams<K>,
        options: RequestOptions,
    ) => Promise<LapisData<K>>;
    return fn(params, options);
}

export function lapisQueryOptions<K extends LapisEndpoint>(lapisUrl: string, endpoint: K, params: LapisParams<K>) {
    return {
        queryKey: ['lapis', lapisUrl, endpoint, params] as const,
        queryFn: ({ signal }: { signal?: AbortSignal }) => callEndpoint(lapisUrl, endpoint, params, { signal }),
        ...LAPIS_RETRY_OPTIONS,
    };
}

/**
 * @example
 * const { data } = useLapisQuery(lapisUrl, 'lineageDefinition', { column: fieldName });
 */
export function useLapisQuery<K extends LapisEndpoint>(
    lapisUrl: string,
    endpoint: K,
    params: LapisParams<K>,
    options: LapisQueryOptions<K> = {},
) {
    return useQuery<LapisData<K>, Error>({ ...lapisQueryOptions(lapisUrl, endpoint, params), ...options });
}

/**
 * For LAPIS requests that are triggered imperatively (e.g. on input). The mutation variables are the endpoint's params.
 *
 * @example
 * const { data, mutate } = useLapisMutation(lapisUrl, 'aggregated');
 * mutate({ fields: [fieldName] });
 */
export function useLapisMutation<K extends LapisEndpoint>(
    lapisUrl: string,
    endpoint: K,
    options: LapisMutationOptions<K> = {},
) {
    return useMutation<LapisData<K>, Error, LapisParams<K>>({
        mutationFn: (params) => callEndpoint(lapisUrl, endpoint, params),
        ...LAPIS_RETRY_OPTIONS,
        ...options,
    });
}
