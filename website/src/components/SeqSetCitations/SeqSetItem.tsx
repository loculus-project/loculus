import MUIPagination from '@mui/material/Pagination';
import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import CitationList from './CitationList.tsx';
import { DatePlot, CategoryPlot } from './SeqSetPlots.tsx';
import { SeqSetRecordsTableWithMetadata } from './SeqSetRecordsTableWithMetadata';
import type { AggregateRow } from './getSeqSetStatistics.ts';
import { getClientLogger } from '../../clientLogger';
import { seqSetCitationClientHooks, seqSetRecordsQueryOptions } from '../../services/serviceHooks';
import type { ProblemDetail } from '../../types/backend.ts';
import type { SeqSetGraph } from '../../types/config.ts';
import type { ClientConfig } from '../../types/runtimeConfig';
import { type SeqSet, type SeqSetCitation, type SeqSetRecord } from '../../types/seqSetCitation';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { getThemeColor } from '../../utils/getThemeColor';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { Button } from '../common/Button.tsx';
import { Spinner } from '../common/Spinner.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';
import MdiDotsGrid from '~icons/mdi/dots-grid';
import MdiViewGrid from '~icons/mdi/view-grid';
import OouiNewWindowLtr from '~icons/ooui/new-window-ltr';

const logger = getClientLogger('SeqSetItem');

export const SEQSET_RECORDS_PER_PAGE = 10;

const SeqSetSection: FC<{ title: string; children: React.ReactNode; headerContent?: React.ReactNode }> = ({
    title,
    children,
    headerContent,
}) => (
    <div className='flex flex-col mb-6'>
        <div className='flex flex-row items-center justify-between my-4 py-2'>
            <h2 className='text-xl font-semibold border-b'>{title}</h2>
            {headerContent}
        </div>
        {children}
    </div>
);

const SeqSetSectionSeparator: FC = () => <hr className='my-8 border-t-2 border-gray-200' />;

const SeqSetSectionEntry: FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className='flex flex-row py-1.5'>
        <div className='mr-8 w-[120px] text-gray-500'>{label}</div>
        <div className='w-2/3 lg:w-1/2'>{value}</div>
    </div>
);

type SeqSetItemProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    seqSetAccessionVersion: string;
    seqSet: SeqSet;
    seqSetRecordCount: number;
    /** The first SEQSET_RECORDS_PER_PAGE records; later pages are fetched in the browser. */
    firstPageSeqSetRecords: SeqSetRecord[];
    seqSetCitations: SeqSetCitation[];
    seqSetGraphs: SeqSetGraph[];
    seqSetGraphsData: Record<string, AggregateRow[]>;
    isAdminView?: boolean;
    fieldsToDisplay?: { field: string; displayName: string }[];
    organismDisplayNames?: Record<string, string>;
};

const SeqSetItemInner: FC<SeqSetItemProps> = ({
    clientConfig,
    accessToken,
    seqSetAccessionVersion,
    seqSet,
    seqSetRecordCount,
    firstPageSeqSetRecords,
    seqSetCitations,
    seqSetGraphs,
    seqSetGraphsData,
    isAdminView = false,
    fieldsToDisplay,
    organismDisplayNames,
}) => {
    const [page, setPage] = useState(1);
    const [wideGraphs, setWideGraphs] = useState(false);

    const allSeqSetRecords = useQuery({
        ...seqSetRecordsQueryOptions(clientConfig, seqSet.seqSetId, seqSet.seqSetVersion),
        enabled: page > 1,
    });

    const { mutate: createSeqSetDOI } = useCreateSeqSetDOIAction(
        clientConfig,
        accessToken,
        seqSet.seqSetId,
        seqSet.seqSetVersion,
        (message) => toast.error(message, { position: 'top-center', autoClose: false }),
    );

    const handleCreateDOI = () => {
        createSeqSetDOI(undefined);
    };

    const getCrossRefUrl = () => {
        return `https://search.crossref.org/search/works?from_ui=yes&q=${seqSet.seqSetDOI}`;
    };

    const renderDOI = () => {
        if (seqSet.seqSetDOI !== undefined && seqSet.seqSetDOI !== null) {
            return (
                <span className='inline-flex items-center gap-3'>
                    {`https://doi.org/${seqSet.seqSetDOI}`}
                    <a
                        className='text-gray-500'
                        href={getCrossRefUrl()}
                        target='_blank'
                        rel='noopener noreferrer'
                        title='View DOI on CrossRef'
                    >
                        <OouiNewWindowLtr className='w-4 h-4' />
                    </a>
                </span>
            );
        }

        if (!isAdminView) {
            return 'N/A';
        }

        return (
            <a
                className='mr-4 cursor-pointer font-medium text-blue-600 hover:text-blue-800'
                onClick={() =>
                    displayConfirmationDialog({
                        dialogText: `Are you sure you want to create a DOI for this version of your seqSet?`,
                        onConfirmation: handleCreateDOI,
                    })
                }
            >
                Generate a DOI
            </a>
        );
    };

    const maxPages = Math.ceil(seqSetRecordCount / SEQSET_RECORDS_PER_PAGE);

    const pageSeqSetRecords =
        page === 1
            ? firstPageSeqSetRecords
            : allSeqSetRecords.data?.slice((page - 1) * SEQSET_RECORDS_PER_PAGE, page * SEQSET_RECORDS_PER_PAGE);

    const barPlotColor = getThemeColor('--color-primary-500', '#6b84c6');

    return (
        <div className='flex flex-col'>
            <div className='grid grid-cols-1 lg:grid-cols-2'>
                <SeqSetSection title='Details'>
                    <SeqSetSectionEntry label='Name' value={seqSet.name} />
                    <SeqSetSectionEntry label='Description' value={seqSet.description ?? 'N/A'} />
                    <SeqSetSectionEntry label='Version' value={seqSet.seqSetVersion} />
                    <SeqSetSectionEntry
                        label='Size'
                        value={`${seqSetRecordCount} sequence${seqSetRecordCount === 1 ? '' : 's'}`}
                    />
                </SeqSetSection>
                <SeqSetSection title='Citations'>
                    <SeqSetSectionEntry label='DOI' value={renderDOI()} />
                    <SeqSetSectionEntry
                        label='Cited in'
                        value={
                            seqSetCitations.length > 0 ? (
                                <CitationList
                                    citations={seqSetCitations}
                                    maxDisplayedCitations={3}
                                    modalTitle='SeqSet Citations'
                                />
                            ) : (
                                <span>No citations found.</span>
                            )
                        }
                    />
                </SeqSetSection>
            </div>
            <SeqSetSectionSeparator />
            <SeqSetSection
                title='Statistics'
                headerContent={
                    <Button
                        variant='outline'
                        className='mt-1 flex items-center gap-2'
                        onClick={() => setWideGraphs((prev) => !prev)}
                    >
                        {wideGraphs ? <MdiViewGrid /> : <MdiDotsGrid />}
                        <span className='hidden sm:block'>Toggle size</span>
                    </Button>
                }
            >
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6 ${!wideGraphs ? 'lg:grid-cols-3' : ''}`}>
                    {seqSetGraphs.map((graph) =>
                        graph.type === 'date' ? (
                            <DatePlot
                                key={graph.name}
                                data={seqSetGraphsData[graph.name] ?? []}
                                description={`${graph.displayName} for ${seqSetAccessionVersion} sequences`}
                                barColor={barPlotColor}
                            />
                        ) : (
                            <CategoryPlot
                                key={graph.name}
                                data={seqSetGraphsData[graph.name] ?? []}
                                description={`${graph.displayName} for ${seqSetAccessionVersion} sequences`}
                                barColor={barPlotColor}
                            />
                        ),
                    )}
                </div>
            </SeqSetSection>
            <SeqSetSectionSeparator />
            <SeqSetSection title='Sequences'>
                {pageSeqSetRecords !== undefined ? (
                    <SeqSetRecordsTableWithMetadata
                        seqSetRecords={pageSeqSetRecords}
                        clientConfig={clientConfig}
                        fieldsToDisplay={fieldsToDisplay}
                        organismDisplayNames={organismDisplayNames}
                    />
                ) : (
                    <div className='flex justify-center py-16'>
                        {allSeqSetRecords.isError ? (
                            <p className='text-red-500'>
                                Failed to load SeqSet records: {String(allSeqSetRecords.error)}
                            </p>
                        ) : (
                            <Spinner />
                        )}
                    </div>
                )}
                {maxPages > 1 ? (
                    <MUIPagination
                        className='my-4 w-full flex justify-center'
                        page={page}
                        count={maxPages}
                        color='primary'
                        variant='outlined'
                        shape='rounded'
                        onChange={(_, newPage) => {
                            setPage(newPage);
                        }}
                    />
                ) : null}
            </SeqSetSection>
        </div>
    );
};

function useCreateSeqSetDOIAction(
    clientConfig: ClientConfig,
    accessToken: string,
    seqSetId: string,
    seqSetVersion: number,
    onError: (message: string) => void,
) {
    return seqSetCitationClientHooks(clientConfig).useCreateSeqSetDOI(
        { headers: createAuthorizationHeader(accessToken), params: { seqSetId, seqSetVersion } },
        {
            onSuccess: async () => {
                await logger.info(
                    `Successfully created seqSet DOI for seqSetId: ${seqSetId}, version ${seqSetVersion}`,
                );
                location.reload();
            },
            onError: async (error) => {
                await logger.info(`Failed to create seqSet DOI with error: '${JSON.stringify(error)})}'`);
                if (error instanceof AxiosError) {
                    const responseData = error.response?.data as ProblemDetail | undefined;
                    if (error.response?.data !== undefined) {
                        onError(`Failed to update seqSet. ${responseData?.title}. ${responseData?.detail}`);
                    }
                }
            },
        },
    );
}

export const SeqSetItem = withQueryProvider(SeqSetItemInner);
