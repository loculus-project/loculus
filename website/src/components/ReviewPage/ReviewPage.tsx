import { type FC, useState } from 'react';

import { ReviewCard } from './ReviewCard.tsx';
import { useSubmissionOperations } from '../../hooks/useSubmissionOperations.ts';
import { routes } from '../../routes.ts';
import {
    awaitingApprovalStatus,
    hasErrorsStatus,
    inProcessingStatus,
    receivedStatus,
    type SequenceEntryStatus,
} from '../../types/backend.ts';
import { type ClientConfig } from '../../types/runtimeConfig.ts';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback.tsx';
import { withQueryProvider } from '../common/withProvider.tsx';

type ReviewPageProps = {
    clientConfig: ClientConfig;
    organism: string;
    accessToken: string;
};

const InnerReviewPage: FC<ReviewPageProps> = ({ clientConfig, organism, accessToken }) => {
    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();
    const [showErrors, setShowErrors] = useState(true);

    const hooks = useSubmissionOperations(organism, clientConfig, accessToken, openErrorFeedback);

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
                                        clientConfig={clientConfig}
                                        organism={organism}
                                        accessToken={accessToken}
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
    let unprocessedCount = 0;
    let processingCount = 0;
    sequences.forEach((sequence) => {
        switch (sequence.status) {
            case receivedStatus:
                unprocessedCount++;
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
    return { processedCount, errorCount, unprocessedCount, processingCount, total: sequences.length };
};

export const ReviewPage = withQueryProvider(InnerReviewPage);
