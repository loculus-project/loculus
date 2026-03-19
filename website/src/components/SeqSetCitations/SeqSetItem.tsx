import MUIPagination from '@mui/material/Pagination';
import { AxiosError } from 'axios';
import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { AuthorDetails } from './AuthorDetails.tsx';
import { CitationPlot } from './CitationPlot';
import { SeqSetRecordsTableWithMetadata } from './SeqSetRecordsTableWithMetadata';
import { getClientLogger } from '../../clientLogger';
import { seqSetCitationClientHooks } from '../../services/serviceHooks';
import type { ProblemDetail } from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig';
import { type CitedByResult, type SeqSet, type SeqSetRecord } from '../../types/seqSetCitation';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { BarPlot } from '../common/BarPlot.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

const logger = getClientLogger('SeqSetItem');

const SeqSetSectionTitle: FC<{ title: string }> = ({ title }) => (
    <h1 className='text-xl font-semibold border-b py-2 my-4'>{title}</h1>
);

const SeqSetDetailsTitle: FC<{ title: string }> = ({ title }) => (
    <div className='flex flex-row'>
        <h1 className='text-xl font-semibold border-b py-2 mb-3'>{title}</h1>
    </div>
);

const SeqSetDetailsEntry: FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className='flex flex-row py-1.5'>
        <p className='mr-8 w-[120px] text-gray-500'>{label}</p>
        <p className='text max-w-lg'>{value}</p>
    </div>
);

type SeqSetItemProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    seqSetAccessionVersion: string;
    seqSet: SeqSet;
    seqSetRecords: SeqSetRecord[];
    citedByData: CitedByResult;
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
    citedByData,
    isAdminView = false,
    fieldsToDisplay,
    organismDisplayNames,
}) => {
    const [page, setPage] = useState(1);
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

    return (
        <div className='flex flex-col'>
            <div className='grid grid-cols-1 md:grid-cols-2'>
                <div className='flex flex-col'>
                    <SeqSetDetailsTitle title='Details' />
                    <SeqSetDetailsEntry label='Name' value={seqSet.name} />
                    <SeqSetDetailsEntry label='Description' value={seqSet.description ?? 'N/A'} />
                    <SeqSetDetailsEntry label='Version' value={seqSet.seqSetVersion} />
                    <SeqSetDetailsEntry
                        label='Created by'
                        value={<AuthorDetails displayFullDetails={false} firstName={seqSet.createdBy} />}
                    />
                    <SeqSetDetailsEntry label='Created date' value={formatDate(seqSet.createdAt)} />
                    <SeqSetDetailsEntry
                        label='Size'
                        value={`${seqSetRecords.length} sequence${seqSetRecords.length === 1 ? '' : 's'}`}
                    />
                </div>
                <div className='flex flex-col'>
                    <SeqSetDetailsTitle title='Citations' />
                    <SeqSetDetailsEntry label='DOI' value={renderDOI()} />
                    <SeqSetDetailsEntry
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
                                    Cited by 0
                                </a>
                            )
                        }
                    />
                    <SeqSetDetailsEntry
                        label='Citations over time'
                        value={
                            <CitationPlot
                                citedByData={citedByData}
                                responsive={false}
                                description='Number of times this SeqSet has been cited by a publication'
                            />
                        }
                    />
                </div>
            </div>
            <SeqSetSectionTitle title='Metadata' />
            <div className='grid grid-cols-1 md:grid-cols-3 gap-x-6'>
                <BarPlot
                    data={{ labels: [1, 2, 3, 4], datasets: [{ data: [1, 2, 3, 4] }] }}
                    description={`Sample collection dates for ${seqSetAccessionVersion} sequences`}
                />
                <BarPlot
                    data={{ labels: [1, 2, 3, 4], datasets: [{ data: [1, 2, 3, 4] }] }}
                    description={`Countries for ${seqSetAccessionVersion} sequences`}
                />
                <BarPlot
                    data={{ labels: [1, 2, 3, 4], datasets: [{ data: [1, 2, 3, 4] }] }}
                    description={`Use terms for ${seqSetAccessionVersion} sequences`}
                />
            </div>
            <SeqSetSectionTitle title='Sequences' />
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
