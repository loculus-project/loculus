import { useState } from 'react';
import { toast } from 'react-toastify';

import { useApproveProcessedData, useDeleteSequences, useGetSequences } from '../services/backend/backendHooks.ts';
import {
    type Group,
    processedStatus,
    inProcessingStatus,
    type PageQuery,
    receivedStatus,
    noIssuesProcessingResult,
    warningsProcessingResult,
    errorsProcessingResult,
    type SequenceEntryProcessingResultNames,
    type SequenceEntryStatusNames,
} from '../types/backend.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import { stringifyMaybeAxiosError } from '../utils/stringifyMaybeAxiosError.ts';

export function useSubmissionOperations(
    organism: string,
    group: Group,
    clientConfig: ClientConfig,
    accessToken: string,
    openErrorFeedback: (message: string) => void,
    pageQuery: PageQuery,
) {
    const allRelevantStatuses: SequenceEntryStatusNames[] = [receivedStatus, inProcessingStatus, processedStatus];
    const allProcessingResults: SequenceEntryProcessingResultNames[] = [
        noIssuesProcessingResult,
        warningsProcessingResult,
        errorsProcessingResult,
    ];
    const [includedStatuses, setIncludedStatuses] = useState(allRelevantStatuses);
    const [includedProcessingResults, setIncludedProcessingResults] = useState(allProcessingResults);
    const getSequences = useGetSequences(
        clientConfig,
        accessToken,
        organism,
        {
            groupIdsFilter: [group.groupId],
            // TODO: switch to the dedicated /review-data endpoint that replaces this flag
            includeReviewData: true, // eslint-disable-line @typescript-eslint/no-deprecated
            statusesFilter: includedStatuses,
            processingResultFilter: includedProcessingResults,
            page: pageQuery.pageOneIndexed - 1,
            size: pageQuery.size,
        },
        {
            onError: (error) => openErrorFeedback(getSequencesErrorMessage(error)),
            refetchInterval: (data) =>
                data === undefined || data.statusCounts[receivedStatus] > 0 || data.statusCounts[inProcessingStatus] > 0
                    ? 2000
                    : 30000,
            keepPreviousData: true,
        },
    );

    if (getSequences.error) {
        openErrorFeedback(`Failed to query Group`);
    }

    const deleteSequenceEntries = useDeleteSequences(clientConfig, accessToken, organism, {
        onSuccess: () => getSequences.refetch(),
        onError: (error) => openErrorFeedback(deleteSequenceEntriesErrorMessage(error)),
    });
    const approveProcessedData = useApproveProcessedData(clientConfig, accessToken, organism, {
        onMutate: () => {
            const toastId = toast.loading('Approving sequences...');
            return { toastId };
        },
        onSuccess: (data, _variables, context) => {
            void getSequences.refetch();
            const ctx = context as { toastId: string | number } | undefined;
            if (ctx?.toastId) {
                const isBatchRelease = data.length > 1;
                toast.update(ctx.toastId, {
                    render: isBatchRelease
                        ? '🎉 All sequences have been approved. They will appear on the website shortly.'
                        : 'Sequence approved. It will appear on the website shortly.',
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
    });

    return {
        deleteSequenceEntries: deleteSequenceEntries.mutate,
        approveProcessedData: approveProcessedData.mutate,
        getSequences,
        includedStatuses,
        setIncludedStatuses,
        includedProcessingResults,
        setIncludedProcessingResults,
    };
}

function deleteSequenceEntriesErrorMessage(error: unknown) {
    return 'Failed to delete sequence entries: ' + stringifyMaybeAxiosError(error);
}

function approveProcessedDataErrorMessage(error: unknown) {
    return 'Failed to approve processed sequence entries: ' + stringifyMaybeAxiosError(error);
}

function getSequencesErrorMessage(error: unknown) {
    return 'Failed to query sequences: ' + stringifyMaybeAxiosError(error);
}
