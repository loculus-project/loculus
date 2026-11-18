import { useMutation, useQuery, type UseMutationOptions, type UseQueryOptions } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
    type BackendApiClient,
    BackendApiError,
    createBackendApiClient,
    unwrapBackendResponse,
} from './backendApiClient.ts';
import {
    type AccessionVersion,
    getSequencesResponse,
    type GetSequencesResponse,
    sequenceEntryToEdit,
    type SequenceEntryToEdit,
    type SubmissionIdMapping,
} from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

/**
 * React-query hooks for the Loculus backend, built on the generated openapi-fetch client.
 * Every hook fails with a {@link BackendApiError}.
 */

type BackendQueryOptions<T> = Omit<UseQueryOptions<T, BackendApiError, T, unknown[]>, 'queryKey' | 'queryFn'>;
type BackendMutationOptions<T, Variables> = Omit<UseMutationOptions<T, BackendApiError, Variables>, 'mutationFn'>;

type JsonBody<Path extends keyof Paths, Method extends 'post' | 'put' | 'delete'> = Paths[Path][Method] extends {
    requestBody?: { content: { 'application/json': infer Body } }; // eslint-disable-line @typescript-eslint/naming-convention
}
    ? Body
    : never;
type Paths = import('./openapi').paths;

function useBackendApiClient(clientConfig: ClientConfig, accessToken: string): BackendApiClient {
    return useMemo(
        () => createBackendApiClient(clientConfig.backendUrl, accessToken),
        [clientConfig.backendUrl, accessToken],
    );
}

export type GetSequencesQuery = NonNullable<Paths['/{organism}/get-sequences']['get']['parameters']['query']>;

export function useGetSequences(
    clientConfig: ClientConfig,
    accessToken: string,
    organism: string,
    query: GetSequencesQuery,
    options?: BackendQueryOptions<GetSequencesResponse>,
) {
    const client = useBackendApiClient(clientConfig, accessToken);
    return useQuery<GetSequencesResponse, BackendApiError, GetSequencesResponse, unknown[]>({
        queryKey: ['backend', clientConfig.backendUrl, organism, 'get-sequences', query],
        queryFn: () =>
            unwrapBackendResponse(
                client.GET('/{organism}/get-sequences', { params: { path: { organism }, query } }),
                getSequencesResponse,
            ),
        ...options,
    });
}

export function useGetDataToEdit(
    clientConfig: ClientConfig,
    accessToken: string,
    organism: string,
    accessionVersion: AccessionVersion,
    options?: BackendQueryOptions<SequenceEntryToEdit>,
) {
    const client = useBackendApiClient(clientConfig, accessToken);
    const { accession, version } = accessionVersion;
    return useQuery<SequenceEntryToEdit, BackendApiError, SequenceEntryToEdit, unknown[]>({
        queryKey: ['backend', clientConfig.backendUrl, organism, 'get-data-to-edit', accession, version],
        queryFn: () =>
            unwrapBackendResponse(
                client.GET('/{organism}/get-data-to-edit/{accession}/{version}', {
                    params: { path: { organism, accession, version } },
                }),
                sequenceEntryToEdit,
            ),
        ...options,
    });
}

export type SubmitFilesRequest = {
    metadataFile: File;
    sequenceFile?: File;
    groupId: number;
    dataUseTermsType: NonNullable<Paths['/{organism}/submit']['post']['parameters']['query']>['dataUseTermsType'];
    restrictedUntil: string | null;
};

export function useSubmit(
    clientConfig: ClientConfig,
    accessToken: string,
    organism: string,
    options?: BackendMutationOptions<SubmissionIdMapping[], SubmitFilesRequest>,
) {
    const client = useBackendApiClient(clientConfig, accessToken);
    return useMutation({
        mutationFn: ({ metadataFile, sequenceFile, groupId, dataUseTermsType, restrictedUntil }: SubmitFilesRequest) =>
            unwrapBackendResponse(
                client.POST('/{organism}/submit', {
                    params: {
                        path: { organism },
                        query: { groupId, dataUseTermsType, restrictedUntil: restrictedUntil ?? undefined },
                    },
                    body: { metadataFile, sequenceFile },
                    bodySerializer: toFormData,
                }),
            ),
        ...options,
    });
}

export type ReviseFilesRequest = {
    metadataFile: File;
    sequenceFile?: File;
};

export function useRevise(
    clientConfig: ClientConfig,
    accessToken: string,
    organism: string,
    options?: BackendMutationOptions<SubmissionIdMapping[], ReviseFilesRequest>,
) {
    const client = useBackendApiClient(clientConfig, accessToken);
    return useMutation({
        mutationFn: (files: ReviseFilesRequest) =>
            unwrapBackendResponse(
                client.POST('/{organism}/revise', {
                    params: { path: { organism } },
                    body: files,
                    bodySerializer: toFormData,
                }),
            ),
        ...options,
    });
}

export type RevokeRequest = JsonBody<'/{organism}/revoke', 'post'>;

export function useRevokeSequences(
    clientConfig: ClientConfig,
    accessToken: string,
    organism: string,
    options?: BackendMutationOptions<SubmissionIdMapping[], RevokeRequest>,
) {
    const client = useBackendApiClient(clientConfig, accessToken);
    return useMutation({
        mutationFn: (body: RevokeRequest) =>
            unwrapBackendResponse(client.POST('/{organism}/revoke', { params: { path: { organism } }, body })),
        ...options,
    });
}

export type SubmitEditedDataRequest = JsonBody<'/{organism}/submit-edited-data', 'post'>;

export function useSubmitEditedData(
    clientConfig: ClientConfig,
    accessToken: string,
    organism: string,
    options?: BackendMutationOptions<unknown, SubmitEditedDataRequest>,
) {
    const client = useBackendApiClient(clientConfig, accessToken);
    return useMutation({
        mutationFn: (body: SubmitEditedDataRequest) =>
            unwrapBackendResponse(
                client.POST('/{organism}/submit-edited-data', { params: { path: { organism } }, body }),
            ),
        ...options,
    });
}

export type ApproveProcessedDataRequest = JsonBody<'/{organism}/approve-processed-data', 'post'>;

export function useApproveProcessedData(
    clientConfig: ClientConfig,
    accessToken: string,
    organism: string,
    options?: BackendMutationOptions<AccessionVersion[], ApproveProcessedDataRequest>,
) {
    const client = useBackendApiClient(clientConfig, accessToken);
    return useMutation({
        mutationFn: (body: ApproveProcessedDataRequest) =>
            unwrapBackendResponse(
                client.POST('/{organism}/approve-processed-data', { params: { path: { organism } }, body }),
            ),
        ...options,
    });
}

export type DeleteSequencesRequest = JsonBody<'/{organism}/delete-sequence-entry-versions', 'delete'>;

export function useDeleteSequences(
    clientConfig: ClientConfig,
    accessToken: string,
    organism: string,
    options?: BackendMutationOptions<AccessionVersion[], DeleteSequencesRequest>,
) {
    const client = useBackendApiClient(clientConfig, accessToken);
    return useMutation({
        mutationFn: (body: DeleteSequencesRequest) =>
            unwrapBackendResponse(
                client.DELETE('/{organism}/delete-sequence-entry-versions', { params: { path: { organism } }, body }),
            ),
        ...options,
    });
}

export type SetDataUseTermsRequest = JsonBody<'/data-use-terms', 'put'>;

export function useSetDataUseTerms(
    clientConfig: ClientConfig,
    accessToken: string,
    options?: BackendMutationOptions<unknown, SetDataUseTermsRequest>,
) {
    const client = useBackendApiClient(clientConfig, accessToken);
    return useMutation({
        mutationFn: (body: SetDataUseTermsRequest) => unwrapBackendResponse(client.PUT('/data-use-terms', { body })),
        ...options,
    });
}

function toFormData(files: { metadataFile: Blob; sequenceFile?: Blob } | undefined) {
    const formData = new FormData();
    if (files === undefined) {
        return formData;
    }
    formData.append('metadataFile', files.metadataFile);
    if (files.sequenceFile !== undefined) {
        formData.append('sequenceFile', files.sequenceFile);
    }
    return formData;
}
