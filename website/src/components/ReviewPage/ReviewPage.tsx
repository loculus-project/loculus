import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import Pagination from '@mui/material/Pagination';
import { type ChangeEvent, type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { ReviewCard } from './ReviewCard.tsx';
import { useSubmissionOperations } from '../../hooks/useSubmissionOperations.ts';
import { routes } from '../../routes/routes.ts';
import {
    approveAllDataScope,
    deleteAllDataScope,
    deleteProcessedDataWithErrorsScope,
    errorsProcessingResult,
    type GetSequencesResponse,
    type Group,
    inProcessingStatus,
    noIssuesProcessingResult,
    type PageQuery,
    processedStatus,
    receivedStatus,
    type SequenceEntryStatus,
    warningsProcessingResult,
} from '../../types/backend.ts';
import { type ReferenceGenomesInfo } from '../../types/referencesGenomes.ts';
import { type ClientConfig } from '../../types/runtimeConfig.ts';
import { getAccessionVersionString } from '../../utils/extractAccessionVersion.ts';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { getLastApprovalTimeKey } from '../SearchPage/RecentSequencesBanner.tsx';
import { Button } from '../common/Button';
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
    metadataDisplayNames: Map<string, string>;
    filesEnabled: boolean;
    referenceGenomesInfo: ReferenceGenomesInfo;
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
        <div className='flex items-center gap-3 text-sm text-gray-700 px-3'>
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

const InnerReviewPage: FC<ReviewPageProps> = ({
    clientConfig,
    organism,
    group,
    accessToken,
    metadataDisplayNames,
    filesEnabled,
    referenceGenomesInfo,
}) => {
    const [pageQuery, setPageQuery] = useState<PageQuery>({ pageOneIndexed: 1, size: pageSizeOptions[2] });

    const hooks = useSubmissionOperations(organism, group, clientConfig, accessToken, toast.error, pageQuery);

    const showNoIssues = hooks.includedProcessingResults.includes(noIssuesProcessingResult);
    const showWarnings = hooks.includedProcessingResults.includes(warningsProcessingResult);
    const showErrors = hooks.includedProcessingResults.includes(errorsProcessingResult);
    const showUnprocessed =
        hooks.includedStatuses.includes(inProcessingStatus) && hooks.includedStatuses.includes(receivedStatus);

    const setAStatus = (status: string, value: boolean) => {
        hooks.setIncludedStatuses((prev) => {
            if (value) {
                return [...prev, status];
            }
            return prev.filter((s) => s !== status);
        });
    };

    const setAProcessingResult = (status: string, include: boolean) => {
        hooks.setIncludedProcessingResults((prev) => {
            if (include) {
                return [...prev, status];
            }
            return prev.filter((s) => s !== status);
        });
    };

    const setShowNoIssues = (value: boolean) => setAProcessingResult(noIssuesProcessingResult, value);
    const setShowWarnings = (value: boolean) => setAProcessingResult(warningsProcessingResult, value);
    const setShowErrors = (value: boolean) => setAProcessingResult(errorsProcessingResult, value);
    const setShowUnprocessed = (value: boolean) => {
        setAStatus(inProcessingStatus, value);
        setAStatus(receivedStatus, value);
    };

    const handleSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const newSize = parseInt(event.target.value, 10);
        setPageQuery({ pageOneIndexed: 1, size: newSize });
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

    const receivedCount = sequencesData.statusCounts[receivedStatus];
    const processingCount = sequencesData.statusCounts[inProcessingStatus];
    const unprocessedCount = receivedCount + processingCount;
    const processedCount = sequencesData.statusCounts[processedStatus];
    const total = processedCount + unprocessedCount;

    const errorCount = sequencesData.processingResultCounts[errorsProcessingResult];
    const warningCount = sequencesData.processingResultCounts[warningsProcessingResult];
    const noIssuesCount = sequencesData.processingResultCounts[noIssuesProcessingResult];
    const validCount = warningCount + noIssuesCount;

    const selectedCount: number =
        (showUnprocessed ? unprocessedCount : 0) +
        (showNoIssues ? noIssuesCount : 0) +
        (showWarnings ? warningCount : 0) +
        (showErrors ? errorCount : 0);

    // If we narrowed the selection and the selected page doesn't exist anymore, go to the last existing page instead
    if ((pageQuery.pageOneIndexed - 1) * pageQuery.size > selectedCount) {
        setPageQuery({ ...pageQuery, pageOneIndexed: Math.ceil(selectedCount / pageQuery.size) });
    }

    if (total === 0) {
        return (
            <div className='pt-1 text-gray-600'>
                You do not currently have any unreleased sequences awaiting review. You can view your released sequences
                on the{' '}
                <a href={routes.mySequencesPage(organism, group.groupId)} className='text-primary-600 hover:underline'>
                    Released sequences
                </a>{' '}
                page.
            </div>
        );
    }

    const sequences: SequenceEntryStatus[] = sequencesData.sequenceEntries;

    const controlPanel = (
        <div className='flex flex-col' data-testid='review-page-control-panel'>
            <div className='text-gray-600 mr-3'>
                {unprocessedCount > 0 && (
                    <span className='loading loading-spinner loading-sm mr-2 relative top-1'> </span>
                )}
                {processedCount} of {total} sequences processed
            </div>
            <div className='border border-slate-200 p-3 mt-3 flex items-start'>
                <LucideFilter className='w-4 h-4 inline-block text-gray-500 mt-1 mr-3' />
                <NumberAndVisibility
                    key='unprocessed'
                    text='awaiting processing'
                    countNumber={unprocessedCount}
                    setVisibility={setShowUnprocessed}
                    visibilityEnabled={showUnprocessed}
                />
                <div className='border-green-500 border-b-2 pb-1'>
                    <NumberAndVisibility
                        key='valid'
                        text='no issues'
                        countNumber={noIssuesCount}
                        setVisibility={setShowNoIssues}
                        visibilityEnabled={showNoIssues}
                    />
                </div>
                <div className='border-yellow-400 border-b-2 pb-1'>
                    <NumberAndVisibility
                        key='warnings'
                        text='with warnings'
                        countNumber={warningCount}
                        setVisibility={setShowWarnings}
                        visibilityEnabled={showWarnings}
                    />
                </div>
                <div className='border-b-2 border-red-600 pb-1'>
                    <NumberAndVisibility
                        key='errors'
                        text='with errors'
                        countNumber={errorCount}
                        setVisibility={setShowErrors}
                        visibilityEnabled={showErrors}
                    />
                </div>
            </div>
        </div>
    );

    const pagination = (
        <div className='flex justify-end align-center gap-3 py-3'>
            <Pagination
                count={Math.ceil(selectedCount / pageQuery.size)}
                page={pageQuery.pageOneIndexed}
                onChange={(_, newPage) => {
                    setPageQuery({ ...pageQuery, pageOneIndexed: newPage });
                }}
                color='primary'
                variant='outlined'
                shape='rounded'
            />
            <div>
                <label htmlFor='pageSize'>Page size: </label>
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
            {processedCount > 0 && (
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
                                    <Button
                                        className={menuItemClassName}
                                        onClick={() =>
                                            displayConfirmationDialog({
                                                dialogText:
                                                    'Are you sure you want to discard all sequences with errors?',
                                                confirmButtonText: 'Discard',
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
                                    </Button>
                                </MenuItem>
                            )}
                            <MenuItem>
                                <Button
                                    className={menuItemClassName}
                                    onClick={() =>
                                        displayConfirmationDialog({
                                            dialogText: `Are you sure you want to discard all ${processedCount} processed sequences?`,
                                            confirmButtonText: 'Discard',
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
                                    Discard all {processedCount} processed sequences
                                </Button>
                            </MenuItem>
                        </div>
                    </MenuItems>
                </Menu>
            )}
            {validCount > 0 && (
                <Button
                    className='border rounded-md p-1 bg-primary-600 text-white px-2'
                    onClick={() =>
                        displayConfirmationDialog({
                            dialogText: 'Are you sure you want to release all valid sequences?',
                            confirmButtonText: 'Release',
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
                    Release {validCount} valid sequence
                    {validCount > 1 ? 's' : ''}
                </Button>
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
                            metadataDisplayNames={metadataDisplayNames}
                            approveAccessionVersion={() =>
                                displayConfirmationDialog({
                                    dialogText: `Are you sure you want to approve ${getAccessionVersionString(sequence)}?`,
                                    confirmButtonText: 'Approve',
                                    onConfirmation: () => {
                                        hooks.approveProcessedData({
                                            accessionVersionsFilter: [sequence],
                                            groupIdsFilter: [group.groupId],
                                            scope: approveAllDataScope.value,
                                        });
                                        storeLastApprovalTime(organism);
                                    },
                                })
                            }
                            deleteAccessionVersion={() =>
                                displayConfirmationDialog({
                                    dialogText: `Are you sure you want to discard ${getAccessionVersionString(sequence)}?`,
                                    confirmButtonText: 'Discard',
                                    onConfirmation: () => {
                                        hooks.deleteSequenceEntries({
                                            accessionVersionsFilter: [sequence],
                                            groupIdsFilter: [group.groupId],
                                            scope: deleteAllDataScope.value,
                                        });
                                    },
                                })
                            }
                            editAccessionVersion={() => {
                                window.location.href = routes.editPage(organism, sequence);
                            }}
                            clientConfig={clientConfig}
                            organism={organism}
                            accessToken={accessToken}
                            filesEnabled={filesEnabled}
                            referenceGenomesInfo={referenceGenomesInfo}
                        />
                    </div>
                );
            })}
        </div>
    );

    return (
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
    );
};

const storeLastApprovalTime = (organism: string) => {
    const lastApprovalTime = Math.floor(Date.now() / 1000);
    localStorage.setItem(getLastApprovalTimeKey(organism), lastApprovalTime.toString());
};

export const ReviewPage = withQueryProvider(InnerReviewPage);
