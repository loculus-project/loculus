import { useMutation, type UseMutationOptions, useQuery, type UseQueryOptions } from '@tanstack/react-query';

import { retryOptions, useApiContext } from '../components/common/withQueryProvider.tsx';
import { getLapisUrl } from '../config.ts';
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

function useCallEndpoint<K extends LapisEndpoint>(organism: string, endpoint: K) {
    const lapisUrl = getLapisUrl(useApiContext().clientConfig, organism);
    return (params: LapisParams<K>, options: RequestOptions = {}): Promise<LapisData<K>> =>
        (lapisApi(lapisUrl)[endpoint] as (params: LapisParams<K>, options: RequestOptions) => Promise<LapisData<K>>)(
            params,
            options,
        );
}

/**
 * The query key is `['lapis', organism, endpoint, params]`: the LAPIS URL differs between server and browser.
 *
 * @example
 * const { data } = useLapisQuery(organism, 'lineageDefinition', { column: fieldName });
 */
export function useLapisQuery<K extends LapisEndpoint>(
    organism: string,
    endpoint: K,
    params: LapisParams<K>,
    options: LapisQueryOptions<K> = {},
) {
    const callEndpoint = useCallEndpoint(organism, endpoint);
    return useQuery<LapisData<K>, Error>({
        queryKey: ['lapis', organism, endpoint, params],
        queryFn: ({ signal }) => callEndpoint(params, { signal }),
        ...options,
    });
}

/**
 * For LAPIS requests that are triggered imperatively (e.g. on input). The mutation variables are the endpoint's params.
 * LAPIS requests only read data, so these are retried like queries, even though they use POST.
 *
 * @example
 * const { data, mutate } = useLapisMutation(organism, 'aggregated');
 * mutate({ fields: [fieldName] });
 */
export function useLapisMutation<K extends LapisEndpoint>(
    organism: string,
    endpoint: K,
    options: LapisMutationOptions<K> = {},
) {
    const callEndpoint = useCallEndpoint(organism, endpoint);
    return useMutation<LapisData<K>, Error, LapisParams<K>>({
        mutationFn: (params) => callEndpoint(params),
        ...retryOptions,
        ...options,
    });
}
