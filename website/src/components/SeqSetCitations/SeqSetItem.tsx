import MUIPagination from '@mui/material/Pagination';
import { AxiosError } from 'axios';
import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { CitationPlot } from './CitationPlot';
import { getClientLogger } from '../../clientLogger';
import { seqSetCitationClientHooks } from '../../services/serviceHooks';
import type { ClientConfig } from '../../types/runtimeConfig';
import { type SeqSetRecord, type SeqSet, type CitedByResult, SeqSetRecordType } from '../../types/seqSetCitation';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

const logger = getClientLogger('SeqSetItem');

type SeqSetRecordsTableProps = {
    seqSetRecords: SeqSetRecord[];
    sortByKey?: keyof SeqSetRecord;
};

const SeqSetRecordsTable: FC<SeqSetRecordsTableProps> = ({ seqSetRecords, sortByKey = 'isFocal' }) => {
    if (seqSetRecords.length === 0) {
        return null;
    }

    const accessionOutlink = {
        [SeqSetRecordType.loculus]: (acc: string) => `/seq/${acc}`,
    };

    const sortedSeqRecords = seqSetRecords.sort((a: SeqSetRecord, b: SeqSetRecord) => {
        const x = a[sortByKey];
        const y = b[sortByKey];
        return x > y ? -1 : x < y ? 1 : 0;
    });

    return (
        <table className='table-auto w-full '>
            <thead>
                <tr>
                    <th className='w-1/3 text-left font-medium'>Accession</th>
                    <th className='w-1/3 text-left font-medium'>Context</th>
                </tr>
            </thead>
            <tbody>
                {sortedSeqRecords.map((seqSetRecord, index) => {
                    return (
                        <tr key={`accessionData-${index}`} className='hover:bg-primary-100 border-gray-100'>
                            <td className='text-left'>
                                <a href={accessionOutlink[seqSetRecord.type](seqSetRecord.accession)} target='_blank'>
                                    {seqSetRecord.accession}
                                </a>
                            </td>
                            <td className='text-left'>{seqSetRecord.isFocal === true ? 'Focal' : 'Background'}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};

type SeqSetItemProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    seqSet: SeqSet;
    seqSetRecords: SeqSetRecord[];
    citedByData: CitedByResult;
    isAdminView?: boolean;
};

const SeqSetItemInner: FC<SeqSetItemProps> = ({
    clientConfig,
    accessToken,
    seqSet,
    seqSetRecords,
    citedByData,
    isAdminView = false,
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

    const handleCreateDOI = async () => {
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
        <div className='flex flex-col items-left'>
            <div>
                <h1 className='text-2xl font-semibold pb-4'>{seqSet.name}</h1>
            </div>
            <div className='flex flex-col'>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>Description</p>
                    <p className='text max-w-lg'>{seqSet.description ?? 'N/A'}</p>
                </div>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>Version</p>
                    <p className='text max-w-lg'>{seqSet.seqSetVersion}</p>
                </div>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>Created date</p>
                    <p className='text max-w-lg'>{formatDate(seqSet.createdAt)}</p>
                </div>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>Size</p>
                    <p className='text max-w-lg'>{`${seqSetRecords.length} sequence${seqSetRecords.length === 1 ? '' : 's'}`}</p>
                </div>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>DOI</p>
                    {renderDOI()}
                </div>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>Total citations</p>
                    {seqSet.seqSetDOI === undefined || seqSet.seqSetDOI === null ? (
                        <p className='text'>Cited By 0</p>
                    ) : (
                        <a
                            className='mr-4 cursor-pointer font-medium text-blue-600 hover:text-blue-800'
                            href={getCrossRefUrl()}
                            target='_blank'
                        >
                            Cited By 0
                        </a>
                    )}
                </div>
                <div className='flex flex-row'>
                    <p className='mr-0 w-[120px]'></p>
                    <div className='ml-4'>
                        <CitationPlot citedByData={citedByData} />
                        <p className='text-sm text-center text-gray-500 my-4 ml-8 max-w-64'>
                            Number of times this SeqSet has been cited by a publication
                        </p>
                    </div>
                </div>
            </div>
            <div className='flex flex-col my-4 max-w-xl'>
                <p className='text-xl my-4 font-semibold'>Sequences</p>
                <SeqSetRecordsTable seqSetRecords={getPaginatedSeqSetRecords()} />
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
                    if (error.response?.data !== undefined) {
                        onError(
                            `Failed to update seqSet. ${error.response.data?.title}. ${error.response.data?.detail}`,
                        );
                    }
                }
            },
        },
    );
}

export const SeqSetItem = withQueryProvider(SeqSetItemInner);
