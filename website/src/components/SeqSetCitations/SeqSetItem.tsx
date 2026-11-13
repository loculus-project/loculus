import MUIPagination from '@mui/material/Pagination';
import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { type FC, useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import CitationList from './CitationList.tsx';
import { DatePlot, CategoryPlot, fetchSeqSetAggregates } from './SeqSetPlots.tsx';
import { SeqSetRecordsTableWithMetadata } from './SeqSetRecordsTableWithMetadata';
import { getClientLogger } from '../../clientLogger';
import { seqSetCitationClientHooks } from '../../services/serviceHooks';
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

export type SeqSetGraphWithExtraFields = SeqSetGraph & { organismFields: Record<string, string> };

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

const SeqSetGraphCard: FC<{
    clientConfig: ClientConfig;
    graph: SeqSetGraphWithExtraFields;
    seqSetAccessionVersion: string;
    seqSetRecords: SeqSetRecord[];
}> = ({ clientConfig, graph, seqSetAccessionVersion, seqSetRecords }) => {
    const barColor = getThemeColor('--color-primary-500', '#6b84c6');

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['seqset-graph', seqSetAccessionVersion, graph.name, graph.organismFields, clientConfig],
        queryFn: () =>
            fetchSeqSetAggregates(
                seqSetRecords.map((record) => record.accession),
                graph.organismFields,
                clientConfig,
            ),
        retry: false,
    });

    useEffect(() => {
        if (isError) {
            toast.error(
                `Error while fetching seqSet statistics: ${error instanceof Error ? error.message : String(error)}`,
                { position: 'top-center', autoClose: false },
            );
        }
    }, [isError, error]);

    if (isLoading) {
        return (
            <div className='flex items-center justify-center h-48'>
                <Spinner />
            </div>
        );
    }

    if (isError) {
        return (
            <div className='flex items-center justify-center h-48 text-gray-500'>
                Error while fetching {graph.displayName.toLowerCase()} statistics
            </div>
        );
    }

    const description = `${graph.displayName} for ${seqSetAccessionVersion} sequences`;
    return graph.type === 'date' ? (
        <DatePlot data={data} description={description} barColor={barColor} />
    ) : (
        <CategoryPlot data={data} description={description} barColor={barColor} />
    );
};

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
    seqSetRecords: SeqSetRecord[];
    seqSetCitations: SeqSetCitation[];
    seqSetGraphs: SeqSetGraphWithExtraFields[];
    isAdminView?: boolean;
    fieldsToDisplay?: { field: string; displayName: string }[];
    organismDisplayNames?: Record<string, string>;
};

const SeqSetItemInner: FC<SeqSetItemProps> = ({
    clientConfig,
    accessToken,
    seqSetAccessionVersion,
    seqSet,
    seqSetRecords,
    seqSetCitations,
    seqSetGraphs,
    isAdminView = false,
    fieldsToDisplay,
    organismDisplayNames,
}) => {
    const [page, setPage] = useState(1);
    const [wideGraphs, setWideGraphs] = useState(false);
    const sequencesPerPage = 10;

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

    const getMaxPages = () => {
        return Math.ceil(seqSetRecords.length / sequencesPerPage);
    };

    const getPaginatedSeqSetRecords = () => {
        return seqSetRecords.slice((page - 1) * sequencesPerPage, page * sequencesPerPage);
    };

    return (
        <div className='flex flex-col'>
            <div className='grid grid-cols-1 lg:grid-cols-2'>
                <SeqSetSection title='Details'>
                    <SeqSetSectionEntry label='Name' value={seqSet.name} />
                    <SeqSetSectionEntry label='Description' value={seqSet.description ?? 'N/A'} />
                    <SeqSetSectionEntry label='Version' value={seqSet.seqSetVersion} />
                    <SeqSetSectionEntry
                        label='Size'
                        value={`${seqSetRecords.length} sequence${seqSetRecords.length === 1 ? '' : 's'}`}
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
                    {seqSetGraphs.map((graph) => (
                        <SeqSetGraphCard
                            key={graph.name}
                            clientConfig={clientConfig}
                            graph={graph}
                            seqSetAccessionVersion={seqSetAccessionVersion}
                            seqSetRecords={seqSetRecords}
                        />
                    ))}
                </div>
            </SeqSetSection>
            <SeqSetSectionSeparator />
            <SeqSetSection title='Sequences'>
                <SeqSetRecordsTableWithMetadata
                    seqSetRecords={getPaginatedSeqSetRecords()}
                    clientConfig={clientConfig}
                    fieldsToDisplay={fieldsToDisplay}
                    organismDisplayNames={organismDisplayNames}
                />
                {getMaxPages() > 1 ? (
                    <MUIPagination
                        className='my-4 w-full flex justify-center'
                        page={page}
                        count={getMaxPages()}
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
