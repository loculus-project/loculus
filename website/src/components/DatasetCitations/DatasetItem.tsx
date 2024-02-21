import Link from '@mui/material/Link';
import { type FC } from 'react';

import { CitationPlot } from './CitationPlot';
import { getClientLogger } from '../../clientLogger';
import { datasetCitationClientHooks } from '../../services/serviceHooks';
import { type DatasetRecord, type Dataset, type CitedByResult, DatasetRecordType } from '../../types/datasetCitation';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

const logger = getClientLogger('DatasetItem');

type DatasetRecordsTableProps = {
    datasetRecords: DatasetRecord[];
};

const DatasetRecordsTable: FC<DatasetRecordsTableProps> = ({ datasetRecords }) => {
    if (datasetRecords.length === 0) {
        return null;
    }

    const accessionOutlink = {
        [DatasetRecordType.loculus]: (acc: string) => `/sequences/${acc}`,
        [DatasetRecordType.genbank]: (acc: string) => `https://www.ncbi.nlm.nih.gov/nuccore/?term=${acc}`,
        [DatasetRecordType.sra]: (acc: string) => `https://www.ncbi.nlm.nih.gov/sra/?term=${acc}`,
    };

    return (
        <table className='table-auto w-full'>
            <thead>
                <tr>
                    <th className='w-1/10 text-left font-medium'>Accession</th>
                    <th className='w-1/10 text-left font-medium'>Source</th>
                </tr>
            </thead>
            <tbody>
                {datasetRecords.map((datasetRecord, index) => {
                    return (
                        <tr key={`accessionData-${index}`}>
                            <td className='text-left'>
                                {datasetRecord.type !== DatasetRecordType.gisaid ? (
                                    <Link
                                        href={accessionOutlink[datasetRecord.type](datasetRecord.accession)}
                                        target='_blank'
                                        underline='none'
                                        sx={{ padding: 0, margin: 0 }}
                                    >
                                        {datasetRecord.accession}
                                    </Link>
                                ) : (
                                    datasetRecord.accession
                                )}
                            </td>
                            <td className='text-left'>{datasetRecord.type as string}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};

type DatasetItemProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    dataset: Dataset;
    datasetRecords: DatasetRecord[];
    citedByData: CitedByResult;
};

const DatasetItemInner: FC<DatasetItemProps> = ({
    clientConfig,
    accessToken,
    dataset,
    datasetRecords,
    citedByData,
}) => {
    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();

    const { mutate: createDatasetDOI } = useCreateDatasetDOIAction(
        clientConfig,
        accessToken,
        dataset.datasetId,
        dataset.datasetVersion,
        openErrorFeedback,
    );

    const handleCreateDOI = async () => {
        createDatasetDOI(undefined);
    };

    const getCrossRefUrl = () => {
        return `https://search.crossref.org/search/works?from_ui=yes&q=${dataset.datasetDOI}`;
    };

    const formatDate = (date?: string) => {
        if (date === undefined) {
            return 'N/A';
        }
        const dateObj = new Date(date);
        return dateObj.toLocaleDateString('en-US');
    };

    return (
        <div className='flex flex-col items-left'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />
            <div>
                <h1 className='text-2xl font-semibold pb-4'>{dataset.name}</h1>
            </div>
            <div className='flex flex-col'>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>Description</p>
                    <p className='text'>{dataset.description ?? 'N/A'}</p>
                </div>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>Version</p>
                    <p className='text'>{dataset.datasetVersion}</p>
                </div>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>Created date</p>
                    <p className='text'>{formatDate(dataset.createdAt)}</p>
                </div>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>DOI</p>
                    {dataset.datasetDOI === undefined || dataset.datasetDOI === null ? (
                        <Link
                            className='mr-4'
                            component='button'
                            underline='none'
                            onClick={() =>
                                displayConfirmationDialog({
                                    dialogText: `Are you sure you want to create a DOI for this dataset and version?`,
                                    onConfirmation: handleCreateDOI,
                                })
                            }
                        >
                            Generate a DOI
                        </Link>
                    ) : (
                        dataset.datasetDOI
                    )}
                </div>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>Total citations</p>
                    {dataset.datasetDOI === undefined || dataset.datasetDOI === null ? (
                        <p className='text'>Cited By 0</p>
                    ) : (
                        <Link href={getCrossRefUrl()} target='_blank' underline='none'>
                            Cited By 0
                        </Link>
                    )}
                </div>
                <div className='flex flex-row'>
                    <p className='mr-0 w-[120px] text-gray-500 text-right'></p>
                    <CitationPlot citedByData={citedByData} />
                </div>
            </div>
            <div className='flex flex-col my-4'>
                <p className='text-xl py-4 font-semibold'>Sequences</p>
                <DatasetRecordsTable datasetRecords={datasetRecords} />
            </div>
        </div>
    );
};

function useCreateDatasetDOIAction(
    clientConfig: ClientConfig,
    accessToken: string,
    datasetId: string,
    datasetVersion: number,
    onError: (message: string) => void,
) {
    return datasetCitationClientHooks(clientConfig).useCreateDatasetDOI(
        { headers: createAuthorizationHeader(accessToken), params: { datasetId, datasetVersion } },
        {
            onSuccess: async () => {
                await logger.info(
                    `Successfully created dataset DOI for datasetId: ${datasetId}, version ${datasetVersion}`,
                );
                location.reload();
            },
            onError: async (error) => {
                const message = `Failed to create dataset DOI with error: '${JSON.stringify(error)})}'`;
                await logger.info(message);
                onError(message);
            },
        },
    );
}

export const DatasetItem = withQueryProvider(DatasetItemInner);
