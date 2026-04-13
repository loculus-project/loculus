import { isErrorFromAlias } from '@zodios/core';
import type { AxiosError } from 'axios';
import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';

import { backendApi } from '../services/backendApi.ts';
import { backendClientHooks } from '../services/serviceHooks.ts';
import {
    type Group,
    processedStatus,
    inProcessingStatus,
    type PageQuery,
    receivedStatus,
    noIssuesProcessingResult,
    warningsProcessingResult,
    errorsProcessingResult,
} from '../types/backend.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';
import { stringifyMaybeAxiosError } from '../utils/stringifyMaybeAxiosError.ts';

export function useSubmissionOperations(
    organism: string,
    group: Group,
    clientConfig: ClientConfig,
    accessToken: string,
    openErrorFeedback: (message: string) => void,
    pageQuery: PageQuery,
) {
    const hooks = useMemo(() => backendClientHooks(clientConfig), [clientConfig]);
    const allRelevantStatuses = [receivedStatus, inProcessingStatus, processedStatus];
    const allProcessingResults = [noIssuesProcessingResult, warningsProcessingResult, errorsProcessingResult];
    const [includedStatuses, setIncludedStatuses] = useState(allRelevantStatuses);
    const [includedProcessingResults, setIncludedProcessingResults] = useState(allProcessingResults);
    const useGetSequences = hooks.useGetSequences(
        {
            headers: createAuthorizationHeader(accessToken),
            params: {
                organism,
            },
            queries: {
                groupIdsFilter: group.groupId.toString(),
                initialStatusesFilter: allRelevantStatuses.join(','),
                statusesFilter: includedStatuses.join(','),
                processingResultFilter: includedProcessingResults.join(','),
                page: pageQuery.pageOneIndexed - 1,
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
            onMutate: () => {
                const toastId = toast.loading('Releasing sequences...');
                return { toastId };
            },
            onSuccess: (data, _variables, context) => {
                void useGetSequences.refetch();
                const ctx = context as { toastId: string | number } | undefined;
                if (ctx?.toastId) {
                    const isBatchRelease = data.length > 1;
                    toast.update(ctx.toastId, {
                        render: isBatchRelease
                            ? '🎉 All sequences have been released successfully!'
                            : 'Sequence released successfully.',
                        type: 'success',
                        isLoading: false,
                        autoClose: isBatchRelease ? false : 4000,
                        closeButton: isBatchRelease,
                    });
                }
            },
            onError: (error, _variables, context) => {
                const ctx = context as { toastId: string | number } | undefined;
                if (ctx?.toastId) {
                    toast.update(ctx.toastId, {
                        render: approveProcessedDataErrorMessage(error),
                        type: 'error',
                        isLoading: false,
                        autoClose: false,
                    });
                }
            },
        },
    );

    return {
        deleteSequenceEntries: useDeleteSequenceEntries.mutate,
        approveProcessedData: useApproveProcessedData.mutate,
        getSequences: useGetSequences,
        includedStatuses,
        setIncludedStatuses,
        includedProcessingResults,
        setIncludedProcessingResults,
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
