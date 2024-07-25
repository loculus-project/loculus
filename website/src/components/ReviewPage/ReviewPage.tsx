import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import Pagination from '@mui/material/Pagination';
import { type ChangeEvent, type FC, useState } from 'react';

import { ReviewCard } from './ReviewCard.tsx';
import { useSubmissionOperations } from '../../hooks/useSubmissionOperations.ts';
import { routes } from '../../routes/routes.ts';
import {
    approveAllDataScope,
    awaitingApprovalStatus,
    deleteAllDataScope,
    deleteProcessedDataWithErrorsScope,
    type GetSequencesResponse,
    type Group,
    hasErrorsStatus,
    inProcessingStatus,
    type PageQuery,
    receivedStatus,
    type SequenceEntryStatus,
} from '../../types/backend.ts';
import { type ClientConfig } from '../../types/runtimeConfig.ts';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { getLastApprovalTimeKey } from '../SearchPage/RecentSequencesBanner.tsx';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';
import BiTrash from '~icons/bi/trash';
import IwwaArrowDown from '~icons/iwwa/arrow-down';
import LucideFilter from '~icons/lucide/filter';
import WpfPaperPlane from '~icons/wpf/paper-plane';

const menuItemClassName = `group flex rounded-md items-center w-full px-2 py-2 text-sm
hover:bg-primary-500 bg-primary-600 text-white text-left mb-1`;

let oldSequenceData: GetSequencesResponse | null = null;

type ReviewPageProps = {
    clientConfig: ClientConfig;
    organism: string;
    group: Group;
    accessToken: string;
};

const pageSizeOptions = [10, 20, 50, 100] as const;

const NumberAndVisibility = ({
    text,
    countNumber,
    setVisibility,
    visibilityEnabled,
}: {
    text: string;
    countNumber: number;
    setVisibility: (value: boolean) => void;
    visibilityEnabled: boolean;
}) => {
    return (
        <div className='flex items-center gap-3 text-sm text-gray-600'>
            <label>
                <input
                    type='checkbox'
                    checked={visibilityEnabled}
                    onChange={() => setVisibility(!visibilityEnabled)}
                    className='mr-2 text-gray-400'
                />
                <span className=' inline-block font-semibold '>{countNumber} </span>&nbsp;
                {text}
            </label>
        </div>
    );
};

const InnerReviewPage: FC<ReviewPageProps> = ({ clientConfig, organism, group, accessToken }) => {
    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();

    const [pageQuery, setPageQuery] = useState<PageQuery>({ page: 1, size: pageSizeOptions[2] });

    const hooks = useSubmissionOperations(organism, group, clientConfig, accessToken, openErrorFeedback, pageQuery);

    const showErrors = hooks.includedStatuses.includes(hasErrorsStatus);
    const showUnprocessed =
        hooks.includedStatuses.includes(inProcessingStatus) && hooks.includedStatuses.includes(receivedStatus);
    const showValid = hooks.includedStatuses.includes(awaitingApprovalStatus);

    const setAStatus = (status: string, value: boolean) => {
        hooks.setIncludedStatuses((prev) => {
            if (value) {
                return [...prev, status];
            }
            return prev.filter((s) => s !== status);
        });
    };

    const setShowErrors = (value: boolean) => setAStatus(hasErrorsStatus, value);
    const setShowUnprocessed = (value: boolean) => {
        setAStatus(inProcessingStatus, value);
        setAStatus(receivedStatus, value);
    };

    const setShowValid = (value: boolean) => {
        setAStatus(awaitingApprovalStatus, value);
    };

    const handleSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const newSize = parseInt(event.target.value, 10);
        setPageQuery({ page: 1, size: newSize });
    };

    let sequencesData = hooks.getSequences.data;

    if (!hooks.getSequences.isLoading && !hooks.getSequences.isError) {
        oldSequenceData = hooks.getSequences.data;
    }

    if (hooks.getSequences.isLoading) {
        if (oldSequenceData) {
            sequencesData = oldSequenceData;
        } else {
            return <div>Loading...</div>;
        }
    }

    if (hooks.getSequences.isError) {
        return <div>Error: {hooks.getSequences.error.message}</div>;
    }
    if (sequencesData === undefined) {
        return <div>Loading..</div>;
        // this is not expected to happen, but it's here to satisfy the type checker
    }

    const processingCount = sequencesData.statusCounts[inProcessingStatus];
    const processedCount = sequencesData.statusCounts[awaitingApprovalStatus];
    const errorCount = sequencesData.statusCounts[hasErrorsStatus];
    const receivedCount = sequencesData.statusCounts[receivedStatus];

    const finishedCount = processedCount + errorCount;
    const unfinishedCount = receivedCount + processingCount;

    const total = finishedCount + unfinishedCount;
    const validCount = processedCount;

    if (total === 0) {
        return (
            <div className='pt-1 text-gray-600'>
                You do not currently have any unreleased sequences awaiting review. You can view your released sequences
                on the{' '}
                <a href={routes.mySequencesPage(organism, group.groupId)} className='text-primary-600 hover:underline'>
                    Released Sequences
                </a>{' '}
                page.
            </div>
        );
    }

    const categoryInfo = [
        {
            text: 'sequences still awaiting processing',
            countNumber: unfinishedCount,
            setVisibility: setShowUnprocessed,
            visibilityEnabled: showUnprocessed,
        },
        {
            text: 'valid sequences',
            countNumber: validCount,
            setVisibility: setShowValid,
            visibilityEnabled: showValid,
        },
        {
            text: 'sequences with errors',
            countNumber: errorCount,
            setVisibility: setShowErrors,
            visibilityEnabled: showErrors,
        },
    ];

    const sequences: SequenceEntryStatus[] = sequencesData.sequenceEntries;

    const controlPanel = (
        <div className='flex flex-col'>
            <div className='text-gray-600 mr-3'>
                {unfinishedCount > 0 && (
                    <span className='loading loading-spinner loading-sm mr-2 relative top-1'> </span>
                )}
                {finishedCount} of {total} sequences processed
            </div>
            <div className='border border-gray-200 rounded-md p-3 mt-3 flex gap-3'>
                <LucideFilter className='w-4 h-4 mr-1.5 inline-block text-gray-500 mt-0.5' />
                {categoryInfo.map((info) => {
                    return <NumberAndVisibility {...info} />;
                })}
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
        <div className='flex justify-end items-center gap-3 mt-auto '>
            {finishedCount > 0 && (
                <Menu as='div' className=' inline-block text-left'>
                    <MenuButton className='border rounded-md p-1 bg-primary-600 text-white px-2'>
                        <BiTrash className='inline-block w-4 h-4 -mt-0.5 mr-1.5' />
                        Discard sequences
                        <IwwaArrowDown className='inline-block ml-1 w-3 h-3 -mt-0.5' />
                    </MenuButton>
                    <MenuItems className='origin-top-right absolute z-50 bg-white'>
                        <div className='py-1'>
                            {errorCount > 0 && showErrors && (
                                <MenuItem>
                                    <button
                                        className={menuItemClassName}
                                        onClick={() =>
                                            displayConfirmationDialog({
                                                dialogText:
                                                    'Are you sure you want to discard all sequences with errors?',
                                                onConfirmation: () => {
                                                    hooks.deleteSequenceEntries({
                                                        groupIdsFilter: [group.groupId],
                                                        scope: deleteProcessedDataWithErrorsScope.value,
                                                    });
                                                },
                                            })
                                        }
                                    >
                                        <BiTrash className='inline-block w-4 h-4 -mt-0.5 mr-1.5' />
                                        Discard {errorCount} sequence{errorCount > 1 ? 's' : ''} with errors
                                    </button>
                                </MenuItem>
                            )}
                            <MenuItem>
                                <button
                                    className={menuItemClassName}
                                    onClick={() =>
                                        displayConfirmationDialog({
                                            dialogText: `Are you sure you want to discard all ${finishedCount} processed sequences?`,
                                            onConfirmation: () => {
                                                hooks.deleteSequenceEntries({
                                                    groupIdsFilter: [group.groupId],
                                                    scope: deleteAllDataScope.value,
                                                });
                                            },
                                        })
                                    }
                                >
                                    <BiTrash className='inline-block w-4 h-4 -mt-0.5 mr-1.5' />
                                    Discard all {finishedCount} processed sequences
                                </button>
                            </MenuItem>
                        </div>
                    </MenuItems>
                </Menu>
            )}
            {processedCount > 0 && (
                <button
                    className='border rounded-md p-1 bg-primary-600 text-white px-2'
                    onClick={() =>
                        displayConfirmationDialog({
                            dialogText: 'Are you sure you want to release all valid sequences?',
                            onConfirmation: () => {
                                hooks.approveProcessedData({
                                    groupIdsFilter: [group.groupId],
                                    scope: approveAllDataScope.value,
                                });

                                storeLastApprovalTime(organism);
                            },
                        })
                    }
                >
                    <WpfPaperPlane className='inline-block w-4 h-4 -mt-0.5 mr-1.5' />
                    Release {processedCount} valid sequence
                    {processedCount > 1 ? 's' : ''}
                </button>
            )}
        </div>
    );

    const reviewCards = (
        <div className='flex flex-col gap-2 py-4 divide-y divide-gray-200'>
            {sequences.map((sequence) => {
                return (
                    <div key={sequence.accession}>
                        <ReviewCard
                            sequenceEntryStatus={sequence}
                            approveAccessionVersion={() => {
                                hooks.approveProcessedData({
                                    accessionVersionsFilter: [sequence],
                                    groupIdsFilter: [group.groupId],
                                    scope: approveAllDataScope.value,
                                });
                                storeLastApprovalTime(organism);
                            }}
                            deleteAccessionVersion={() =>
                                hooks.deleteSequenceEntries({
                                    accessionVersionsFilter: [sequence],
                                    groupIdsFilter: [group.groupId],
                                    scope: deleteAllDataScope.value,
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
            <div className={hooks.getSequences.isLoading ? 'opacity-50 pointer-events-none' : ''}>
                <div className='sticky top-0 z-10'>
                    <div className='flex sm:justify-between items-bottom flex-col md:flex-row gap-5 bg-white pb-1'>
                        {controlPanel}
                        {bulkActionButtons}
                    </div>
                    <div
                        className='h-2 w-full'
                        style={{
                            background: 'linear-gradient(0deg, rgba(255, 255, 255, 0) 0%,rgba(100, 100, 100, .2) 80%)',
                        }}
                    ></div>
                </div>
                {reviewCards}
                {pagination}
            </div>
        </>
    );
};

const storeLastApprovalTime = (organism: string) => {
    const lastApprovalTime = Math.floor(Date.now() / 1000);
    localStorage.setItem(getLastApprovalTimeKey(organism), lastApprovalTime.toString());
};

export const ReviewPage = withQueryProvider(InnerReviewPage);
