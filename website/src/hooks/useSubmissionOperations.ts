import { useState } from 'react';
import { toast } from 'react-toastify';

import { useBackendMutation, useBackendQuery } from './useBackend.ts';
import { getErrorMessage } from '../services/apiRequest.ts';
import {
    type AccessionVersionsFilterWithApprovalScope,
    type AccessionVersionsFilterWithDeletionScope,
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

export function useSubmissionOperations(
    organism: string,
    group: Group,
    clientConfig: ClientConfig,
    accessToken: string,
    openErrorFeedback: (message: string) => void,
    pageQuery: PageQuery,
) {
    const context = { clientConfig, accessToken };
    const allRelevantStatuses = [receivedStatus, inProcessingStatus, processedStatus];
    const allProcessingResults = [noIssuesProcessingResult, warningsProcessingResult, errorsProcessingResult];
    const [includedStatuses, setIncludedStatuses] = useState(allRelevantStatuses);
    const [includedProcessingResults, setIncludedProcessingResults] = useState(allProcessingResults);
    const useGetSequences = useBackendQuery(
        context,
        'getSequences',
        {
            organism,
            groupIdsFilter: group.groupId.toString(),
            includeReviewData: true,
            statusesFilter: includedStatuses.join(','),
            processingResultFilter: includedProcessingResults.join(','),
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

    if (useGetSequences.error) {
        openErrorFeedback(`Failed to query Group`);
    }

    const useDeleteSequenceEntries = useBackendMutation(context, 'deleteSequenceEntryVersions', {
        onSuccess: () => useGetSequences.refetch(),
        onError: (error) => openErrorFeedback(deleteSequenceEntriesErrorMessage(error)),
    });
    const useApproveProcessedData = useBackendMutation(context, 'approveProcessedData', {
        onMutate: () => {
            const toastId = toast.loading('Approving sequences...');
            return { toastId };
        },
        onSuccess: (data, _variables, context) => {
            void useGetSequences.refetch();
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
        deleteSequenceEntries: (filter: AccessionVersionsFilterWithDeletionScope) =>
            useDeleteSequenceEntries.mutate({ organism, ...filter }),
        approveProcessedData: (filter: AccessionVersionsFilterWithApprovalScope) =>
            useApproveProcessedData.mutate({ organism, ...filter }),
        getSequences: useGetSequences,
        includedStatuses,
        setIncludedStatuses,
        includedProcessingResults,
        setIncludedProcessingResults,
    };
}

function deleteSequenceEntriesErrorMessage(error: unknown) {
    return 'Failed to delete sequence entries: ' + getErrorMessage(error);
}

function approveProcessedDataErrorMessage(error: unknown) {
    return 'Failed to approve processed sequence entries: ' + getErrorMessage(error);
}

function getSequencesErrorMessage(error: unknown) {
    return 'Failed to query sequences: ' + getErrorMessage(error);
}
