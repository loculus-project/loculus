import {
    useMutation,
    type UseMutationOptions,
    useQuery,
    type UseQueryOptions,
    type QueryKey,
} from '@tanstack/react-query';
import type { AxiosError } from 'axios';

import type { ApiClient, ApiDefinition, ApiResponse, RequestArgs, RequestBody, RequestConfig } from './apiClient.ts';

/**
 * Errors are typed as AxiosError, because that's what is thrown for HTTP errors.
 * Note that an ApiValidationError (which has no `response`) is thrown if the request or response doesn't match the schema.
 */
export type ApiQueryOptions<Data> = Omit<UseQueryOptions<Data, AxiosError, Data>, 'queryKey' | 'queryFn'>;

export type ApiMutationOptions<Data, Variables> = Omit<UseMutationOptions<Data, AxiosError, Variables>, 'mutationFn'>;

/**
 * The query key deliberately doesn't contain the headers, so that e.g. a refreshed access token doesn't
 * invalidate the cache.
 */
export function apiQueryKey(
    baseUrl: string,
    alias: string,
    { params, queries, body }: { params?: unknown; queries?: unknown; body?: unknown },
): QueryKey {
    return [baseUrl, alias, { params, queries, body }];
}

/**
 * Creates a react-query `useQuery` hook for the endpoint `alias`.
 */
export function makeQueryHook<Api extends ApiDefinition, Alias extends keyof Api & string>(
    client: ApiClient<Api>,
    alias: Alias,
) {
    return function useApiQuery(args: RequestArgs<Api[Alias]>, options: ApiQueryOptions<ApiResponse<Api[Alias]>> = {}) {
        return useQuery({
            queryKey: apiQueryKey(client.baseUrl, alias, args),
            queryFn: ({ signal }) => client.request(alias, { ...args, signal }),
            ...options,
        });
    };
}

/**
 * Creates a react-query `useMutation` hook for the endpoint `alias`.
 * The request body is passed to `mutate`, everything else (headers, path params, ...) to the hook itself.
 */
export function makeMutationHook<Api extends ApiDefinition, Alias extends keyof Api & string>(
    client: ApiClient<Api>,
    alias: Alias,
) {
    return function useApiMutation(
        config: RequestConfig<Api[Alias]>,
        options: ApiMutationOptions<ApiResponse<Api[Alias]>, RequestBody<Api[Alias]>> = {},
    ) {
        return useMutation({
            mutationFn: (body: RequestBody<Api[Alias]>) =>
                client.request(alias, { ...config, body } as RequestArgs<Api[Alias]>),
            ...options,
        });
    };
}
