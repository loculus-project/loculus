import { useMutation, type UseMutationOptions, useQuery, type UseQueryOptions } from '@tanstack/react-query';

import { type BackendApi, browserBackendApi, type RequestOptions } from '../services/backendApi.ts';

export type BackendEndpoint = keyof BackendApi;
export type BackendParams<K extends BackendEndpoint> = Parameters<BackendApi[K]>[0];
export type BackendData<K extends BackendEndpoint> = Awaited<ReturnType<BackendApi[K]>>;

/** Errors are `AxiosError`s for HTTP/network errors and `ResponseValidationError`s for unexpected response bodies */
export type BackendQueryOptions<K extends BackendEndpoint> = Omit<
    UseQueryOptions<BackendData<K>, Error>,
    'queryKey' | 'queryFn'
>;
export type BackendMutationOptions<K extends BackendEndpoint> = Omit<
    UseMutationOptions<BackendData<K>, Error, BackendParams<K>>,
    'mutationFn'
>;

function callEndpoint<K extends BackendEndpoint>(
    endpoint: K,
    params: BackendParams<K>,
    options: RequestOptions = {},
): Promise<BackendData<K>> {
    const fn = browserBackendApi()[endpoint] as (
        params: BackendParams<K>,
        options: RequestOptions,
    ) => Promise<BackendData<K>>;
    return fn(params, options);
}

/**
 * Query options for a backend endpoint, e.g. for `queryClient.fetchQuery`. The query key is `['backend', endpoint, params]`.
 *
 * Requests go through the website's backend proxy, which authenticates them with the session cookie.
 */
export function backendQueryOptions<K extends BackendEndpoint>(endpoint: K, params: BackendParams<K>) {
    return {
        queryKey: ['backend', endpoint, params] as const,
        queryFn: ({ signal }: { signal?: AbortSignal }) => callEndpoint(endpoint, params, { signal }),
    };
}

/**
 * @example
 * const { data } = useBackendQuery('getDataToEdit', { organism, accession, version }, { enabled: open });
 */
export function useBackendQuery<K extends BackendEndpoint>(
    endpoint: K,
    params: BackendParams<K>,
    options: BackendQueryOptions<K> = {},
) {
    return useQuery<BackendData<K>, Error>({ ...backendQueryOptions(endpoint, params), ...options });
}

/**
 * The mutation variables are the endpoint's params.
 *
 * @example
 * const { mutate } = useBackendMutation('approveProcessedData', { onSuccess: ... });
 * mutate({ organism, scope: 'ALL', groupIdsFilter: [groupId] });
 */
export function useBackendMutation<K extends BackendEndpoint>(endpoint: K, options: BackendMutationOptions<K> = {}) {
    return useMutation<BackendData<K>, Error, BackendParams<K>>({
        mutationFn: (params) => callEndpoint(endpoint, params),
        ...options,
    });
}
