import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import { type FC, useState } from 'react';

import { type DatasetRecord, type Dataset, DatasetRecordType } from '../../types/datasets';
import { AlertDialog } from '../common/AlertDialog';
import { CitationPlot } from './CitationPlot';

type DatasetRecordsTableProps = {
    datasetRecords: DatasetRecord[];
};

const DatasetRecordsTable: FC<DatasetRecordsTableProps> = ({ datasetRecords }) => {
    if (datasetRecords.length === 0) {
        return null;
    }

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
                                {datasetRecord.type === DatasetRecordType.loculus ? (
                                    <Button
                                        href={`/sequences/${datasetRecord.accession}`}
                                        target='_blank'
                                        variant='text'
                                        sx={{ padding: 0, margin: 0 }}
                                    >
                                        {datasetRecord.accession ?? 'N/A'}
                                    </Button>
                                ) : (
                                    datasetRecord.accession ?? 'N/A'
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
    dataset: Dataset;
    datasetRecords: DatasetRecord[];
};

export const DatasetItem: FC<DatasetItemProps> = ({ dataset, datasetRecords }) => {
    const [doiDialogVisible, setDoiDialogVisible] = useState(false);

    const handleCreateDOI = () => {
        return true;
    };

    const getCrossRefUrl = () => {
        return `https://search.crossref.org/works?from_ui=yes&q=${dataset.datasetDOI}`
    } 

    const formatDate = (date?: string) => {
        if (date === undefined) {
            return 'N/A';
        }
        const dateObj = new Date(date);
        return dateObj.toLocaleDateString('en-US');
    };

    return (
        <div className='flex flex-col items-left'>
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
                    {dataset.datasetDOI === undefined ? (
                        <Link
                            className='mr-4'
                            component='button'
                            underline='none'
                            onClick={() => setDoiDialogVisible(true)}
                        >
                            Generate a DOI
                        </Link>
                    ) : dataset.datasetDOI}
                </div>
                <div className='flex flex-row py-1.5'>
                    <p className='mr-8 w-[120px] text-gray-500 text-right'>Total citations</p>
                    {dataset.datasetDOI === undefined ? (
                        <p className='text'>{'Cited By 0'}</p>
                    ) : (
                        <Link
                            variant='text'
                            href={getCrossRefUrl()}
                            target={'_blank'}
                            underline='none'
                        >
                            Cited By 0
                        </Link>
                    )
                    }

                </div>
                <div className='flex flex-row'>
                    <p className='mr-0 w-[120px] text-gray-500 text-right'></p>
                    <CitationPlot />
                </div>
            </div>
            <div className='flex flex-col my-4'>
                <p className='text-xl py-4 font-semibold'>Sequences</p>
                <DatasetRecordsTable datasetRecords={datasetRecords} />
            </div>
            <AlertDialog
                isVisible={doiDialogVisible}
                setVisible={setDoiDialogVisible}
                title='Generate a DOI'
                description='This feature is under development and will be available soon!'
                onAccept={handleCreateDOI}
            />
        </div>
    );
};
