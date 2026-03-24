import MUIPagination from '@mui/material/Pagination';
import { AxiosError } from 'axios';
import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { AuthorDetails } from './AuthorDetails.tsx';
import { CitationPlot } from './CitationPlot';
import { DatePlot, CountriesPlot, UseTermsPlot } from './SeqSetPlots.tsx';
import { SeqSetRecordsTableWithMetadata } from './SeqSetRecordsTableWithMetadata';
import type { AggregateRow } from './getSeqSetStatistics.ts';
import { getClientLogger } from '../../clientLogger';
import { seqSetCitationClientHooks } from '../../services/serviceHooks';
import type { ProblemDetail } from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig';
import { type AuthorProfile, type CitedByResult, type SeqSet, type SeqSetRecord } from '../../types/seqSetCitation';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

const logger = getClientLogger('SeqSetItem');

const SeqSetSection: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className='flex flex-col mb-6'>
        <div className='flex flex-row'>
            <h1 className='text-xl font-semibold border-b py-2 my-4'>{title}</h1>
        </div>
        {children}
    </div>
);

const SeqSetSectionSeparator: FC = () => <hr className='my-8 border-t-2 border-gray-200' />;

const SeqSetDetails: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className='flex flex-col mb-6'>
        <div className='flex flex-row'>
            <h1 className='text-xl font-semibold border-b py-2 mb-3'>{title}</h1>
        </div>
        {children}
    </div>
);

const SeqSetDetailsEntry: FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
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
    collectionDatesData: AggregateRow[];
    collectionCountriesData: AggregateRow[];
    dataUseTermsData: AggregateRow[];
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
    collectionDatesData,
    collectionCountriesData,
    dataUseTermsData,
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
            <div className='grid grid-cols-1 lg:grid-cols-2'>
                <SeqSetDetails title='Details'>
                    <SeqSetDetailsEntry label='Name' value={seqSet.name} />
                    <SeqSetDetailsEntry label='Description' value={seqSet.description ?? 'N/A'} />
                    <SeqSetDetailsEntry label='Version' value={seqSet.seqSetVersion} />
                    <SeqSetDetailsEntry
                        label='Created by'
                        value={
                            <AuthorDetails
                                displayFullDetails={false}
                                firstName={seqSetAuthor?.firstName}
                                lastName={seqSetAuthor?.lastName}
                            />
                        }
                    />
                    <SeqSetDetailsEntry label='Created date' value={formatDate(seqSet.createdAt)} />
                    <SeqSetDetailsEntry
                        label='Size'
                        value={`${seqSetRecords.length} sequence${seqSetRecords.length === 1 ? '' : 's'}`}
                    />
                </SeqSetDetails>
                <SeqSetDetails title='Citations'>
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
                                description='Number of times this SeqSet has been cited by a publication'
                            />
                        }
                    />
                </SeqSetDetails>
            </div>
            <SeqSetSectionSeparator />
            <SeqSetSection title='Statistics'>
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6'>
                    <DatePlot
                        data={collectionDatesData}
                        description={`Sample collection dates for ${seqSetAccessionVersion} sequences`}
                    />
                    <CountriesPlot
                        data={collectionCountriesData}
                        description={`Sample collection countries for ${seqSetAccessionVersion} sequences`}
                    />
                    <UseTermsPlot
                        data={dataUseTermsData}
                        description={`Data use terms for ${seqSetAccessionVersion} sequences`}
                    />
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
