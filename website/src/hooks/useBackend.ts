import { useMutation, type UseMutationOptions, useQuery, type UseQueryOptions } from '@tanstack/react-query';

import { type ApiContext, useApiContext } from '../components/common/withQueryProvider.tsx';
import { backendApi, type BackendApi, type RequestOptions } from '../services/backendApi.ts';

export type BackendEndpoint = keyof BackendApi;
export type BackendParams<K extends BackendEndpoint> = Parameters<BackendApi[K]>[0];
export type BackendData<K extends BackendEndpoint> = Awaited<ReturnType<BackendApi[K]>>;

/** Request failures are `ApiError`s */
export type BackendQueryOptions<K extends BackendEndpoint> = Omit<
    UseQueryOptions<BackendData<K>, Error>,
    'queryKey' | 'queryFn'
>;
export type BackendMutationOptions<K extends BackendEndpoint> = Omit<
    UseMutationOptions<BackendData<K>, Error, BackendParams<K>>,
    'mutationFn'
>;

function callEndpoint<K extends BackendEndpoint>(
    { clientConfig, accessToken }: ApiContext,
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
export function useBackendQueryOptions<K extends BackendEndpoint>(endpoint: K, params: BackendParams<K>) {
    const context = useApiContext();
    // `context` contains the access token, which must not be part of the query key (see above)
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    return {
        queryKey: ['backend', endpoint, params] as const,
        queryFn: ({ signal }: { signal?: AbortSignal }) => callEndpoint(context, endpoint, params, { signal }),
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
    return useQuery<BackendData<K>, Error>({ ...useBackendQueryOptions(endpoint, params), ...options });
}

/**
 * The mutation variables are the endpoint's params.
 *
 * @example
 * const { mutate } = useBackendMutation('approveProcessedData', { onSuccess: ... });
 * mutate({ organism, scope: 'ALL', groupIdsFilter: [groupId] });
 */
export function useBackendMutation<K extends BackendEndpoint>(endpoint: K, options: BackendMutationOptions<K> = {}) {
    const context = useApiContext();
    return useMutation<BackendData<K>, Error, BackendParams<K>>({
        mutationFn: (params) => callEndpoint(context, endpoint, params),
        ...options,
    });
}
