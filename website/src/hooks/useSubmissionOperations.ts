import { useMemo, useState } from 'react';

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
import { isAxiosErrorWithProblemDetail } from '../utils/isAxiosErrorWithProblemDetail.ts';
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
            onSuccess: () => void useGetSequences.refetch(),
            onError: (error) => openErrorFeedback(deleteSequenceEntriesErrorMessage(error)),
        },
    );
    const useApproveProcessedData = hooks.useApproveProcessedData(
        { headers: createAuthorizationHeader(accessToken), params: { organism } },
        {
            onSuccess: () => void useGetSequences.refetch(),
            onError: (error) => openErrorFeedback(approveProcessedDataErrorMessage(error)),
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

function deleteSequenceEntriesErrorMessage(error: unknown) {
    if (isAxiosErrorWithProblemDetail(error)) {
        return 'Failed to delete sequence entries: ' + error.response.data.detail;
    }
    return 'Failed to delete sequence entries: ' + stringifyMaybeAxiosError(error);
}

function approveProcessedDataErrorMessage(error: unknown) {
    if (isAxiosErrorWithProblemDetail(error)) {
        return 'Failed to approve processed sequence entries: ' + error.response.data.detail;
    }
    return 'Failed to approve processed sequence entries: ' + stringifyMaybeAxiosError(error);
}

function getSequencesErrorMessage(error: unknown) {
    if (isAxiosErrorWithProblemDetail(error)) {
        return 'Failed to query sequences: ' + error.response.data.detail;
    }
    return 'Failed to query sequences: ' + stringifyMaybeAxiosError(error);
}
