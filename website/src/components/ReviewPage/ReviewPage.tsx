import { isErrorFromAlias, Zodios } from '@zodios/core';
import { ZodiosHooks } from '@zodios/react';
import type { AxiosError } from 'axios';
import { type FC, useMemo, useState } from 'react';

import { ReviewCard } from './ReviewCard.tsx';
import { routes } from '../../routes.ts';
import { backendApi } from '../../services/backendApi.ts';
import {
    awaitingApprovalStatus,
    hasErrorsStatus,
    inProcessingStatus,
    receivedStatus,
    type SequenceEntryStatus,
} from '../../types/backend.ts';
import { type ClientConfig } from '../../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError.ts';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../Submission/ManagedErrorFeedback.tsx';
import { withQueryProvider } from '../common/withProvider.tsx';

type ReviewPageProps = {
    clientConfig: ClientConfig;
    organism: string;
    accessToken: string;
};

const InnerReviewPage: FC<ReviewPageProps> = ({ clientConfig, organism, accessToken }) => {
    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();
    const [showErrors, setShowErrors] = useState(true);

    const hooks = useActionHooks(organism, clientConfig, accessToken, openErrorFeedback);

    const { processedCount, processingCount, errorCount, total } = countSequences(hooks.getSequences.data ?? []);

    return (
        <>
            <h1 className='title'>Current submissions</h1>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />
            {hooks.getSequences.isLoading ? (
                <div>Loading...</div>
            ) : hooks.getSequences.data?.length === 0 ? (
                <div>No sequences to review</div>
            ) : (
                <div>
                    <div className='flex flex-col py-2'>
                        <div>
                            {processedCount + errorCount} of {total} sequences processed.
                            {processingCount > 0 && <span className='loading loading-spinner loading-sm ml-3'> </span>}
                        </div>
                        <div>
                            <input
                                className='mr-3'
                                type='checkbox'
                                checked={showErrors}
                                title='Show sequences with errors'
                                onChange={(e) => setShowErrors(e.target.checked)}
                            />
                            Show Errors
                        </div>
                    </div>

                    <div className='flex justify-end'>
                        {errorCount > 0 && showErrors && (
                            <button
                                className='border rounded-md p-1 bg-gray-500 text-white px-2'
                                onClick={() => {
                                    hooks.deleteSequenceEntries({
                                        accessionVersions:
                                            hooks.getSequences.data?.filter(
                                                (sequence) => sequence.status === hasErrorsStatus,
                                            ) ?? [],
                                    });
                                }}
                            >
                                Discard {errorCount} sequences with errors
                            </button>
                        )}
                        {processedCount > 0 && (
                            <button
                                className='border rounded-md p-1 bg-gray-500 text-white px-2 ml-2'
                                onClick={() =>
                                    hooks.approveProcessedData({
                                        accessionVersions:
                                            hooks.getSequences.data?.filter(
                                                (sequence) => sequence.status === awaitingApprovalStatus,
                                            ) ?? [],
                                    })
                                }
                            >
                                Release {processedCount} sequences without errors
                            </button>
                        )}
                    </div>

                    <div className='flex flex-col gap-2 py-4'>
                        {hooks.getSequences.data?.map((sequence) => {
                            if (!showErrors && sequence.status === hasErrorsStatus) {
                                return null;
                            }
                            return (
                                <div key={sequence.accession}>
                                    <ReviewCard
                                        sequenceEntryStatus={sequence}
                                        approveAccessionVersion={() =>
                                            hooks.approveProcessedData({
                                                accessionVersions: [sequence],
                                            })
                                        }
                                        deleteAccessionVersion={() =>
                                            hooks.deleteSequenceEntries({
                                                accessionVersions: [sequence],
                                            })
                                        }
                                        editAccessionVersion={() => {
                                            window.location.href = routes.editPage(organism, sequence);
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </>
    );
};

const countSequences = (sequences: SequenceEntryStatus[]) => {
    let processedCount = 0;
    let errorCount = 0;
    let unProcessedCount = 0;
    let processingCount = 0;
    sequences.forEach((sequence) => {
        switch (sequence.status) {
            case receivedStatus:
                unProcessedCount++;
                break;
            case inProcessingStatus:
                processingCount++;
                break;
            case hasErrorsStatus:
                errorCount++;
                break;
            default:
                processedCount++;
        }
    });
    return { processedCount, errorCount, unProcessedCount, processingCount, total: sequences.length };
};

export const ReviewPage = withQueryProvider(InnerReviewPage);

function useActionHooks(
    organism: string,
    clientConfig: ClientConfig,
    accessToken: string,
    openErrorFeedback: (message: string) => void,
) {
    const zodios = useMemo(() => new Zodios(clientConfig.backendUrl, backendApi), [clientConfig]);
    const hooks = useMemo(() => new ZodiosHooks('loculus', zodios), [zodios]);

    const useGetSequences = hooks.useGetSequences(
        {
            headers: createAuthorizationHeader(accessToken),
            params: {
                organism,
            },
            queries: {
                statusesFilter:
                    receivedStatus + ',' + inProcessingStatus + ',' + awaitingApprovalStatus + ',' + hasErrorsStatus,
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
    const useRevokeSequenceEntries = hooks.useRevokeSequences(
        { headers: createAuthorizationHeader(accessToken), params: { organism } },
        {
            onSuccess: () => useGetSequences.refetch(),
            onError: (error) => openErrorFeedback(getRevokeSequenceEntriesErrorMessage(error)),
        },
    );
    const useConfirmRevocation = hooks.useConfirmRevocation(
        { headers: createAuthorizationHeader(accessToken), params: { organism } },
        {
            onSuccess: () => useGetSequences.refetch(),
            onError: (error) => openErrorFeedback(getConfirmRevocationErrorMessage(error)),
        },
    );

    return {
        deleteSequenceEntries: useDeleteSequenceEntries.mutate,
        approveProcessedData: useApproveProcessedData.mutate,
        revokeSequenceEntries: useRevokeSequenceEntries.mutate,
        confirmRevocation: useConfirmRevocation.mutate,
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

function getRevokeSequenceEntriesErrorMessage(error: unknown | AxiosError) {
    if (isErrorFromAlias(backendApi, 'revokeSequences', error)) {
        return 'Failed to revoke sequence entries: ' + error.response.data.detail;
    }
    return 'Failed to revoke sequence entries: ' + stringifyMaybeAxiosError(error);
}

function getConfirmRevocationErrorMessage(error: unknown | AxiosError) {
    if (isErrorFromAlias(backendApi, 'confirmRevocation', error)) {
        return 'Failed to confirm revocation: ' + error.response.data.detail;
    }
    return 'Failed to confirm revocation: ' + stringifyMaybeAxiosError(error);
}

function getSequencesErrorMessage(error: unknown | AxiosError) {
    if (isErrorFromAlias(backendApi, 'getSequences', error)) {
        return 'Failed to query sequences: ' + error.response.data.detail;
    }
    return 'Failed to query sequences: ' + stringifyMaybeAxiosError(error);
}
