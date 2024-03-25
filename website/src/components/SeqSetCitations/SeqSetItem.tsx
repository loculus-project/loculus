import { AxiosError } from 'axios';
import { type FC } from 'react';

import { CitationPlot } from './CitationPlot';
import { getClientLogger } from '../../clientLogger';
import { seqSetCitationClientHooks } from '../../services/serviceHooks';
import type { ClientConfig } from '../../types/runtimeConfig';
import { type SeqSetRecord, type SeqSet, type CitedByResult, SeqSetRecordType } from '../../types/seqSetCitation';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

const logger = getClientLogger('SeqSetItem');

type SeqSetRecordsTableProps = {
    seqSetRecords: SeqSetRecord[];
};

const SeqSetRecordsTable: FC<SeqSetRecordsTableProps> = ({ seqSetRecords }) => {
    if (seqSetRecords.length === 0) {
        return null;
    }

    const accessionOutlink = {
        [SeqSetRecordType.loculus]: (acc: string) => `/seq/${acc}`,
    };

    return (
        <table className='table-auto w-full max-w-xl'>
            <thead>
                <tr>
                    <th className='w-1/2 text-left font-medium'>Accession</th>
                    <th className='w-1/2 text-left font-medium'>Source</th>
                </tr>
            </thead>
            <tbody>
                {seqSetRecords.map((seqSetRecord, index) => {
                    return (
                        <tr key={`accessionData-${index}`}>
                            <td className='text-left'>
                                <a href={accessionOutlink[seqSetRecord.type](seqSetRecord.accession)} target='_blank'>
                                    {seqSetRecord.accession}
                                </a>
                            </td>
                            <td className='text-left'>{seqSetRecord.type as string}</td>
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
    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();

    const { mutate: createSeqSetDOI } = useCreateSeqSetDOIAction(
        clientConfig,
        accessToken,
        seqSet.seqSetId,
        seqSet.seqSetVersion,
        openErrorFeedback,
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
        return dateObj.toLocaleDateString('en-US');
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
                className='mr-4 cursor-pointer font-medium text-blue-600 dark:text-blue-500 hover:underline'
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

    return (
        <div className='flex flex-col items-left'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />
            <div>
                <h1 className='text-2xl font-semibold pb-4'>{seqSet.name}</h1>
            </div>
            <div className='flex flex-col'>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>Description</p>
                    <p className='text'>{seqSet.description ?? 'N/A'}</p>
                </div>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>Version</p>
                    <p className='text'>{seqSet.seqSetVersion}</p>
                </div>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>Created date</p>
                    <p className='text'>{formatDate(seqSet.createdAt)}</p>
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
                            className='mr-4 cursor-pointer font-medium text-blue-600 dark:text-blue-500 hover:underline'
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
                            Number of times this seqSet has been cited by a publication
                        </p>
                    </div>
                </div>
            </div>
            <div className='flex flex-col my-4'>
                <p className='text-xl py-4 font-semibold'>Sequences</p>
                <SeqSetRecordsTable seqSetRecords={seqSetRecords} />
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
