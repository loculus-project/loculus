import { isErrorFromAlias, type ZodiosPathsByMethod } from '@zodios/core';
import type { AxiosError } from 'axios';
import { useMemo, useState } from 'react';

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

// Factory function to create error message handlers for API operations
function createErrorMessageHandler<T extends ZodiosPathsByMethod<typeof backendApi, 'post' | 'get' | 'delete'>>(
    alias: T,
    errorPrefix: string,
) {
    return (error: unknown | AxiosError): string => {
        if (isErrorFromAlias(backendApi, alias, error)) {
            return `${errorPrefix}: ${error.response.data.detail}`;
        }
        return `${errorPrefix}: ${stringifyMaybeAxiosError(error)}`;
    };
}

const getErrorMessage = {
    deleteSequences: createErrorMessageHandler('deleteSequences', 'Failed to delete sequence entries'),
    approveProcessedData: createErrorMessageHandler('approveProcessedData', 'Failed to approve processed sequence entries'),
    getSequences: createErrorMessageHandler('getSequences', 'Failed to query sequences'),
};

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
    const [includedStatuses, setIncludedStatuses] = useState<string[]>(allRelevantStatuses);
    const [includedProcessingResults, setIncludedProcessingResults] = useState<string[]>(allProcessingResults);
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
            onError: (error) => openErrorFeedback(getErrorMessage.getSequences(error)),
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
            onError: (error) => openErrorFeedback(getErrorMessage.deleteSequences(error)),
        },
    );
    const useApproveProcessedData = hooks.useApproveProcessedData(
        { headers: createAuthorizationHeader(accessToken), params: { organism } },
        {
            onSuccess: () => useGetSequences.refetch(),
            onError: (error) => openErrorFeedback(getErrorMessage.approveProcessedData(error)),
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
