import { useMutation, type UseMutationOptions, useQuery, type UseQueryOptions } from '@tanstack/react-query';

import { backendApi, type BackendApi, type RequestOptions } from '../services/backendApi.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';

export type BackendContext = {
    clientConfig: ClientConfig;
    accessToken?: string;
};

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
    { clientConfig, accessToken }: BackendContext,
    endpoint: K,
    params: BackendParams<K>,
    options: RequestOptions = {},
): Promise<BackendData<K>> {
    const fn = backendApi(clientConfig.backendUrl, accessToken)[endpoint] as (
        params: BackendParams<K>,
        options: RequestOptions,
    ) => Promise<BackendData<K>>;
    return fn(params, options);
}

/**
 * Query options for a backend endpoint, e.g. for `queryClient.fetchQuery`.
 *
 * The query key is `['backend', endpoint, params]`. The access token is deliberately not part of it,
 * because it's a secret, and it doesn't change during a page's lifetime.
 */
export function backendQueryOptions<K extends BackendEndpoint>(
    context: BackendContext,
    endpoint: K,
    params: BackendParams<K>,
) {
    // `context` contains the access token, which must not be part of the query key (see above)
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    return {
        queryKey: ['backend', endpoint, params] as const,
        queryFn: ({ signal }: { signal?: AbortSignal }) => callEndpoint(context, endpoint, params, { signal }),
    };
}

/**
 * @example
 * const { data } = useBackendQuery(context, 'getDataToEdit', { organism, accession, version }, { enabled: open });
 */
export function useBackendQuery<K extends BackendEndpoint>(
    context: BackendContext,
    endpoint: K,
    params: BackendParams<K>,
    options: BackendQueryOptions<K> = {},
) {
    return useQuery<BackendData<K>, Error>({ ...backendQueryOptions(context, endpoint, params), ...options });
}

/**
 * The mutation variables are the endpoint's params.
 *
 * @example
 * const { mutate } = useBackendMutation(context, 'approveProcessedData', { onSuccess: ... });
 * mutate({ organism, scope: 'ALL', groupIdsFilter: [groupId] });
 */
export function useBackendMutation<K extends BackendEndpoint>(
    context: BackendContext,
    endpoint: K,
    options: BackendMutationOptions<K> = {},
) {
    return useMutation<BackendData<K>, Error, BackendParams<K>>({
        mutationFn: (params) => callEndpoint(context, endpoint, params),
        ...options,
    });
}
