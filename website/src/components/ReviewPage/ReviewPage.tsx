import { Pagination } from '@mui/material';
import { type ChangeEvent, type FC, useState } from 'react';

import { ReviewCard } from './ReviewCard.tsx';
import { useSubmissionOperations } from '../../hooks/useSubmissionOperations.ts';
import { routes } from '../../routes.ts';
import {
    awaitingApprovalStatus,
    hasErrorsStatus,
    inProcessingStatus,
    type PageQuery,
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

const pageSizeOptions = [10, 20, 50, 100] as const;

const InnerReviewPage: FC<ReviewPageProps> = ({ clientConfig, organism, accessToken }) => {
    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();
    const [showErrors, setShowErrors] = useState(true);
    const [pageQuery, setPageQuery] = useState<PageQuery>({ page: 1, size: pageSizeOptions[2] });

    const hooks = useSubmissionOperations(organism, clientConfig, accessToken, openErrorFeedback, pageQuery);

    const handleSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const newSize = parseInt(event.target.value, 10);
        setPageQuery({ page: 1, size: newSize });
    };

    if (hooks.getSequences.isLoading) {
        return <div>Loading...</div>;
    }

    if (hooks.getSequences.isError) {
        return <div>Error: {hooks.getSequences.error.message}</div>;
    }

    if (hooks.getSequences.data.sequenceEntries.length === 0) {
        return <div>No sequences to review</div>;
    }

    const total = Object.values(hooks.getSequences.data.statusCounts).reduce(
        (acc: number, count: number) => acc + count,
        0,
    );
    const processingCount = hooks.getSequences.data.statusCounts[inProcessingStatus];
    const processedCount = hooks.getSequences.data.statusCounts[awaitingApprovalStatus];
    const errorCount = hooks.getSequences.data.statusCounts[hasErrorsStatus];
    const sequences: SequenceEntryStatus[] = hooks.getSequences.data.sequenceEntries;

    const controlPanel = (
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
    );

    const pagination = (
        <div className='flex justify-end align-center gap-3 py-3'>
            <Pagination
                count={Math.floor(total / pageQuery.size)}
                page={pageQuery.page}
                onChange={(_, newPage) => {
                    setPageQuery({ ...pageQuery, page: newPage });
                }}
                color='primary'
                variant='outlined'
                shape='rounded'
            />
            <div>
                <label htmlFor='pageSize'>Page Size: </label>
                <select id='pageSize' value={pageQuery.size} onChange={handleSizeChange}>
                    {pageSizeOptions.map((size) => (
                        <option key={size} value={size}>
                            {size}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );

    const bulkActionButtons = (
        <div className='flex justify-end'>
            {errorCount > 0 && showErrors && (
                <button
                    className='border rounded-md p-1 bg-gray-500 text-white px-2'
                    onClick={() => {
                        hooks.deleteSequenceEntries({
                            accessionVersions: sequences.filter((sequence) => sequence.status === hasErrorsStatus),
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
                            accessionVersions: sequences.filter(
                                (sequence) => sequence.status === awaitingApprovalStatus,
                            ),
                        })
                    }
                >
                    Release {processedCount} sequences without errors
                </button>
            )}
        </div>
    );

    const reviewCards = (
        <div className='flex flex-col gap-2 py-4'>
            {sequences.map((sequence) => {
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
    );

    return (
        <>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />
            {controlPanel}
            {bulkActionButtons}
            {reviewCards}
            {pagination}
        </>
    );
};

export const ReviewPage = withQueryProvider(InnerReviewPage);
