import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import { useQueries, useQuery, useMutation, type UseQueryResult } from '@tanstack/react-query';
import { type FC, useState, useEffect } from 'react';

import { DatasetForm } from './DatasetForm';
import { ExportDataset } from './ExportDataset';
import { fetchDataset, fetchDatasetRecords, deleteDataset } from './api';
import { getClientLogger, fetchSequenceDetails } from '../../api';
import { type Config, type ClientConfig, type DatasetRecord, type Dataset, AccessionType } from '../../types';
import { AlertDialog } from '../common/AlertDialog';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';
import Modal from '../common/Modal';
import { withQueryProvider } from '../common/withQueryProvider';

const clientLogger = getClientLogger('DatasetItem');

type DatasetRecordsTableProps = {
    accessionQueries: UseQueryResult<any>[];
    datasetRecords: DatasetRecord[];
};

const DatasetRecordsTable: FC<DatasetRecordsTableProps> = ({ accessionQueries, datasetRecords }) => {
    if (accessionQueries.length === 0) {
        return null;
    }
    const isFinishedFetching = accessionQueries.every((request) => request.isLoading === false);
    if (isFinishedFetching === false) {
        return <CircularProgress size={20} color='primary' />;
    }
    return (
        <table className='table-auto w-full'>
            <thead>
                <tr>
                    <th className='w-1/10 text-left font-medium'>Accession</th>
                    <th className='w-1/10 text-left font-medium'>Source</th>
                    <th className='w-2/10 text-left font-medium'>Country</th>
                    <th className='w-2/10 text-left font-medium'>Date</th>
                </tr>
            </thead>
            <tbody>
                {datasetRecords.map((datasetRecord, index) => {
                    const accessionData = accessionQueries.find(
                        (query) => query.data?.[0]?.accession === datasetRecord.accession,
                    )?.data;

                    return (
                        <tr key={`accessionData-${index}`}>
                            <td className='text-left'>
                                {datasetRecord.type === AccessionType.pathoplexus ? (
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
                            <td className='text-left'>{accessionData?.country ?? 'N/A'}</td>
                            <td className='text-left'>{accessionData?.date ?? 'N/A'}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};

type DatasetItemProps = {
    datasetId: string;
    datasetVersion: string;
    config: Config;
    clientConfig: ClientConfig;
    isAdminView?: boolean;
};

const DatasetItemInner: FC<DatasetItemProps> = ({
    datasetId,
    datasetVersion,
    config,
    clientConfig,
    isAdminView = false,
}) => {
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
    const [doiDialogVisible, setDoiDialogVisible] = useState(false);
    const [citationsDialogVisible, setCitationsDialogVisible] = useState(false);
    const [exportModalVisible, setExportModalVisible] = useState(false);
    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();

    const userId = 'testuser';

    const {
        data: datasets,
        isLoading: isLoadingDataset,
        error: datasetError,
    }: UseQueryResult<Dataset[]> = useQuery({
        queryKey: ['datasets', datasetId, datasetVersion],
        queryFn: () => fetchDataset(datasetId, datasetVersion, clientConfig),
    });

    useEffect(() => {
        const handleError = async (): Promise<void> => {
            openErrorFeedback(`fetchDataset failed with error: ${(datasetError as Error).message}`);
            await clientLogger.error(`fetchDataset failed with error: ${(datasetError as Error).message}`);
        };
        if (datasetError !== null) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            handleError();
        }
    }, [datasetError, openErrorFeedback]);

    const {
        data: datasetRecords,
        isLoading: isLoadingDatasetRecords,
        error: recordsError,
    }: UseQueryResult<DatasetRecord[]> = useQuery(['datasetRecords', datasetId, datasetVersion], () =>
        fetchDatasetRecords(datasetId, datasetVersion, clientConfig),
    );

    useEffect(() => {
        const handleError = async () => {
            openErrorFeedback(`fetchDatasetRecords failed with error: ${(recordsError as Error).message}`);
            await clientLogger.error(`fetchDatasetRecords failed with error: ${(recordsError as Error).message}`);
        };
        if (recordsError !== null) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            handleError().then();
        }
    }, [recordsError, openErrorFeedback]);

    const handleFetchSequence = async (accession: string) => {
        try {
            const response = await fetchSequenceDetails(accession, config, clientConfig);
            await clientLogger.info(`fetchSequenceDetails succeeded for ${accession}`);
            return response;
        } catch (error) {
            openErrorFeedback(`fetchSequenceDetails failed with error: ${(error as Error).message}`);
            await clientLogger.error(`fetchSequenceDetails failed with error: ${(error as Error).message}`);
        }
    };

    const accessionQueries = useQueries({
        queries:
            datasetRecords !== undefined && datasetRecords.length > 0
                ? datasetRecords.map((record: DatasetRecord) => ({
                      queryKey: ['accessionDetails', record.accession, record.type],
                      queryFn: () => handleFetchSequence(record.accession ?? ''),
                  }))
                : [],
    });

    const deleteDatasetMutation = useMutation({
        mutationFn: () => deleteDataset(userId, datasetId, datasetVersion, clientConfig),
    });

    const handleDeleteDataset = async () => {
        try {
            await deleteDatasetMutation.mutateAsync();
            await clientLogger.info(`deleteDataset succeeded for ${datasetId}`);
            location.href = '/datasets';
        } catch (error) {
            openErrorFeedback(`deleteDataset failed with error: ${(error as Error).message}`);
            await clientLogger.error(`deleteDataset failed with error: ${(error as Error).message}`);
        }
    };

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

    const dataset = datasets?.[0];

    return (
        <div className='flex flex-col items-left'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />
            {isLoadingDataset || dataset === undefined ? (
                <CircularProgress />
            ) : (
                <>
                    <div className='flex-row items-center justify-between w-full'>
                        <div className='flex justify-start items-center py-8'>
                            <div className='pr-2'>
                                <Button
                                    sx={{
                                        'backgroundColor': 'whitesmoke',
                                        'color': 'black',
                                        'fontWeight': 'bold',
                                        '&:hover': {
                                            backgroundColor: 'whitesmoke',
                                        },
                                    }}
                                    onClick={() => setExportModalVisible(true)}
                                    variant='contained'
                                >
                                    Export
                                </Button>
                            </div>
                            <div className='px-2 '>
                                {isAdminView ? (
                                    <Button
                                        sx={{
                                            'backgroundColor': 'whitesmoke',
                                            'color': 'black',
                                            'fontWeight': 'bold',
                                            '&:hover': {
                                                backgroundColor: 'whitesmoke',
                                            },
                                        }}
                                        onClick={() => setEditModalVisible(true)}
                                        variant='contained'
                                    >
                                        Edit
                                    </Button>
                                ) : null}
                            </div>
                            <div className='px-2'>
                                {isAdminView ? (
                                    <Button
                                        sx={{
                                            'backgroundColor': 'whitesmoke',
                                            'color': 'black',
                                            'fontWeight': 'bold',
                                            '&:hover': {
                                                backgroundColor: 'whitesmoke',
                                            },
                                        }}
                                        onClick={() => setDeleteDialogVisible(true)}
                                        variant='contained'
                                    >
                                        Delete
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                        <div></div>
                    </div>
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
                                    className='ml-2'
                                    component='button'
                                    underline='none'
                                    onClick={() => setDoiDialogVisible(true)}
                                >
                                    (Generate a DOI)
                                </Link>
                            ) : null}
                        </div>
                        <div className='flex flex-row'>
                            <p className='mr-8 font-medium w-[150px] text-right'>Citations: </p>
                            <p className='text'>{1}</p>
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
                    {isLoadingDatasetRecords || datasetRecords === undefined ? (
                        <CircularProgress />
                    ) : (
                        <div className='flex flex-col my-4'>
                            <p className='text-xl py-4 font-semibold'>Sequences</p>
                            <DatasetRecordsTable datasetRecords={datasetRecords} accessionQueries={accessionQueries} />
                        </div>
                    )}
                    <Modal isModalVisible={editModalVisible} setModalVisible={setEditModalVisible}>
                        <DatasetForm
                            userId={userId}
                            editDataset={dataset}
                            editDatasetRecords={datasetRecords}
                            config={config}
                            clientConfig={clientConfig}
                        />
                    </Modal>
                    <Modal isModalVisible={exportModalVisible} setModalVisible={setExportModalVisible}>
                        <ExportDataset dataset={dataset} accessionQueries={accessionQueries} />
                    </Modal>
                    <AlertDialog
                        isVisible={deleteDialogVisible}
                        setVisible={setDeleteDialogVisible}
                        title='Delete Dataset'
                        description='Are you sure you want to delete this dataset?'
                        onAccept={handleDeleteDataset}
                    />
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
            )}
        </div>
    );
};

export const DatasetItem = withQueryProvider(DatasetItemInner);
