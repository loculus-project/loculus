import MUIPagination from '@mui/material/Pagination';
import { AxiosError } from 'axios';
import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { AuthorDetails } from './AuthorDetails.tsx';
import { CitationPlot } from './CitationPlot';
import { DatePlot, CategoryPlot } from './SeqSetPlots.tsx';
import { SeqSetRecordsTableWithMetadata } from './SeqSetRecordsTableWithMetadata';
import type { AggregateRow } from './getSeqSetStatistics.ts';
import { mainTailwindColor } from '../../../colors.json';
import { getClientLogger } from '../../clientLogger';
import { seqSetCitationClientHooks } from '../../services/serviceHooks';
import type { ProblemDetail } from '../../types/backend.ts';
import type { SeqSetGraph } from '../../types/config.ts';
import type { ClientConfig } from '../../types/runtimeConfig';
import { type AuthorProfile, type CitedByResult, type SeqSet, type SeqSetRecord } from '../../types/seqSetCitation';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { Button } from '../common/Button.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';
import MdiDotsGrid from '~icons/mdi/dots-grid';
import MdiViewGrid from '~icons/mdi/view-grid';
import { useQuery } from '@tanstack/react-query';

const logger = getClientLogger('SeqSetItem');

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
    seqSetAuthor?: AuthorProfile;
    seqSetRecords: SeqSetRecord[];
    citedByData: CitedByResult;
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
    seqSetAuthor,
    seqSetRecords,
    citedByData,
    seqSetGraphs,
    seqSetGraphsData,
    isAdminView = false,
    fieldsToDisplay,
    organismDisplayNames,
}) => {
    const [page, setPage] = useState(1);
    const [wideGraphs, setWideGraphs] = useState(false);
    const sequencesPerPage = 10;

    const { data: totalCitations, isLoading: isTotalCitationsLoading } = useQuery({
        queryKey: ['seqset-total-citations', seqSet.seqSetDOI],
        queryFn: async () => {
            return fetch(`https://api.crossref.org/works/${seqSet.seqSetDOI}/`)
                .then((r) => r.json())
                .then((data) => {
                    return data.message['is-referenced-by-count'] as number;
                });
        },
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

    const formatDate = (date?: string) => {
        if (date === undefined) {
            return 'N/A';
        }
        const dateObj = new Date(date);
        return dateObj.toISOString().split('T')[0];
    };

    const renderDOI = () => {
        if (seqSet.seqSetDOI !== undefined && seqSet.seqSetDOI !== null) {
            return `https://doi.org/${seqSet.seqSetDOI}`;
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

    // Colour used for the plots, derived from colors.json
    const barPlotColor = mainTailwindColor[500];

    return (
        <div className='flex flex-col'>
            <div className='grid grid-cols-1 lg:grid-cols-2'>
                <SeqSetSection title='Details'>
                    <SeqSetSectionEntry label='Name' value={seqSet.name} />
                    <SeqSetSectionEntry label='Description' value={seqSet.description ?? 'N/A'} />
                    <SeqSetSectionEntry label='Version' value={seqSet.seqSetVersion} />
                    <SeqSetSectionEntry
                        label='Created by'
                        value={
                            seqSetAuthor ? (
                                <AuthorDetails
                                    displayFullDetails={false}
                                    firstName={seqSetAuthor.firstName}
                                    lastName={seqSetAuthor.lastName}
                                />
                            ) : (
                                'Unknown'
                            )
                        }
                    />
                    <SeqSetSectionEntry label='Created date' value={formatDate(seqSet.createdAt)} />
                    <SeqSetSectionEntry
                        label='Size'
                        value={`${seqSetRecords.length} sequence${seqSetRecords.length === 1 ? '' : 's'}`}
                    />
                </SeqSetSection>
                <SeqSetSection title='Citations'>
                    <SeqSetSectionEntry label='DOI' value={renderDOI()} />
                    <SeqSetSectionEntry
                        label='Total citations'
                        value={
                            seqSet.seqSetDOI === undefined || seqSet.seqSetDOI === null ? (
                                <p className='text'>Cited by 0</p>
                            ) : (
                                <a
                                    className='mr-4 cursor-pointer font-medium text-blue-600 hover:text-blue-800'
                                    href={getCrossRefUrl()}
                                    target='_blank'
                                >
                                    {isTotalCitationsLoading ? (
                                        <span className='loading loading-spinner loading-xs'></span>
                                    ) : (
                                        <span>Cited by {totalCitations}</span>
                                    )}
                                </a>
                            )
                        }
                    />
                    <SeqSetSectionEntry
                        label='Citations over time'
                        value={
                            <CitationPlot
                                citedByData={citedByData}
                                description='Number of times this SeqSet has been cited by a publication'
                                barColor={barPlotColor}
                            />
                        }
                    />
                </SeqSetSection>
            </div>
            <SeqSetSectionSeparator />
            <SeqSetSection
                title='Statistics'
                headerContent={
                    <Button
                        className='mt-1 outlineButton flex items-center gap-2'
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
