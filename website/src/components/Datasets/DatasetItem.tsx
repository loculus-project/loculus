import { type FC, useState } from 'react';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import { type DatasetRecord, type Dataset, AccessionType } from '../../types/datasets';
import { AlertDialog } from '../common/AlertDialog';

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
                                {datasetRecord.type === AccessionType.loculus ? (
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
    const [citationsDialogVisible, setCitationsDialogVisible] = useState(false);

    const handleCreateDOI = () => {
        return true;
    };

    const handleCitationsClose = () => {
        return true;
    };

    const formatDate = (date?: string) => {
        if (date === undefined) {
            return 'N/A';
        }
        const dateObj = new Date(date);
        return dateObj.toLocaleDateString();
    };

    return (
        <div className='flex flex-col items-left'>
            <>
                <div>
                    <h1 className='text-2xl font-semibold pb-8'>{dataset.name}</h1>
                </div>
                <hr />
                <div className='flex flex-col my-4'>
                    <div className='flex flex-row'>
                        <p className='mr-8 font-medium w-[150px] text-right'>Description: </p>
                        <p className='text'>{dataset.description ?? 'N/A'}</p>
                    </div>
                    <div className='flex flex-row'>
                        <p className='mr-8 font-medium w-[150px] text-right'>Version: </p>
                        <p className='text'>{dataset.datasetVersion}</p>
                    </div>
                    <div className='flex flex-row'>
                        <p className='mr-8 font-medium w-[150px] text-right'>Created Dated: </p>
                        <p className='text'>{formatDate(dataset.createdAt)}</p>
                    </div>
                    <div className='flex flex-row'>
                        <p className='mr-8 font-medium w-[150px] text-right'>DOI: </p>
                        <p className='text'>{dataset.datasetDOI ?? 'N/A'}</p>
                        {dataset.datasetDOI === undefined ? (
                            <Link
                                className='mr-4'
                                component='button'
                                underline='none'
                                onClick={() => setDoiDialogVisible(true)}
                            >
                                (Generate a DOI)
                            </Link>
                        ) : null}
                    </div>
                    <div className='flex flex-row'>
                        <p className='mr-8 font-medium w-[150px] text-right'>Citations:</p>
                        <p className='text mr-4'>{1}</p>
                        <Link
                            className='ml-2'
                            component='button'
                            underline='none'
                            onClick={() => setCitationsDialogVisible(true)}
                        >
                            (View)
                        </Link>
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
                <AlertDialog
                    isVisible={citationsDialogVisible}
                    setVisible={setCitationsDialogVisible}
                    title='Citations'
                    description='This feature is under development and will be available soon!'
                    onAccept={handleCitationsClose}
                />
            </>
        </div>
    );
};
