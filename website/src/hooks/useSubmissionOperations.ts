import { isErrorFromAlias } from '@zodios/core';
import type { AxiosError } from 'axios';
import { useMemo } from 'react';

import { backendApi } from '../services/backendApi.ts';
import { backendClientHooks } from '../services/serviceHooks.ts';
import {
    awaitingApprovalStatus,
    hasErrorsStatus,
    inProcessingStatus,
    type PageQuery,
    receivedStatus,
} from '../types/backend.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';
import { stringifyMaybeAxiosError } from '../utils/stringifyMaybeAxiosError.ts';

export function useSubmissionOperations(
    organism: string,
    clientConfig: ClientConfig,
    accessToken: string,
    openErrorFeedback: (message: string) => void,
    pageQuery: PageQuery,
) {
    const hooks = useMemo(() => backendClientHooks(clientConfig), [clientConfig]);
    const useGetSequences = hooks.useGetSequences(
        {
            headers: createAuthorizationHeader(accessToken),
            params: {
                organism,
            },
            queries: {
                statusesFilter:
                    receivedStatus + ',' + inProcessingStatus + ',' + awaitingApprovalStatus + ',' + hasErrorsStatus,
                page: pageQuery.page - 1,
                size: pageQuery.size,
            },
        },
        {
            onError: (error) => openErrorFeedback(getSequencesErrorMessage(error)),
            refetchInterval: 2000,
        },
    );

    if (useGetSequences.error) {
        openErrorFeedback(`Failed to query Group`);
    }

    const useDeleteSequenceEntries = hooks.useDeleteSequences(
        { headers: createAuthorizationHeader(accessToken), params: { organism } },
        {
            onSuccess: () => useGetSequences.refetch(),
            onError: (error) => openErrorFeedback(deleteSequenceEntriesErrorMessage(error)),
        },
    );
    const useApproveProcessedData = hooks.useApproveProcessedData(
        { headers: createAuthorizationHeader(accessToken), params: { organism } },
        {
            onSuccess: () => useGetSequences.refetch(),
            onError: (error) => openErrorFeedback(approveProcessedDataErrorMessage(error)),
        },
    );

    return {
        deleteSequenceEntries: useDeleteSequenceEntries.mutate,
        approveProcessedData: useApproveProcessedData.mutate,
        getSequences: useGetSequences,
    };
}

function deleteSequenceEntriesErrorMessage(error: unknown | AxiosError) {
    if (isErrorFromAlias(backendApi, 'deleteSequences', error)) {
        return 'Failed to delete sequence entries: ' + error.response.data.detail;
    }
    return 'Failed to delete sequence entries: ' + stringifyMaybeAxiosError(error);
}

function approveProcessedDataErrorMessage(error: unknown | AxiosError) {
    if (isErrorFromAlias(backendApi, 'approveProcessedData', error)) {
        return 'Failed to approve processed sequence entries: ' + error.response.data.detail;
    }
    return 'Failed to approve processed sequence entries: ' + stringifyMaybeAxiosError(error);
}

function getSequencesErrorMessage(error: unknown | AxiosError) {
    if (isErrorFromAlias(backendApi, 'getSequences', error)) {
        return 'Failed to query sequences: ' + error.response.data.detail;
    }
    return 'Failed to query sequences: ' + stringifyMaybeAxiosError(error);
}
