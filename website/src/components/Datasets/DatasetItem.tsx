import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import { useQueries, useQuery, useMutation, type UseQueryResult } from '@tanstack/react-query';
import { type FC, useState } from 'react';

import { DatasetForm } from './DatasetForm';
import { ExportDataset } from './ExportDataset';
import { fetchDataset, deleteDataset } from './api';
import { clientLogger, fetchSequenceDetails } from '../../api';
import type { Config, ClientConfig, DatasetAccession } from '../../types';
import { AlertDialog } from '../common/AlertDialog';
import { ManagedErrorFeedback } from '../common/ManagedErrorFeedback';
import Modal from '../common/Modal';
import withQueryProvider from '../common/withQueryProvider';

type DatasetItemProps = {
    datasetId: string;
    config: Config;
    clientConfig: ClientConfig;
    isAdminView?: boolean;
};
type SequencesTableProps = {
    accessionQueries: UseQueryResult[];
};

const SequencesTable: FC<SequencesTableProps> = ({ accessionQueries }) => {
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
                    <th className='w-1/10 text-left font-medium'>Genbank Accession</th>
                    <th className='w-1/10 text-left font-medium'>SRA Run Accession</th>
                    <th className='w-2/10 text-left font-medium'>Strain</th>
                    <th className='w-2/10 text-left font-medium'>Country</th>
                    <th className='w-2/10 text-left font-medium'>Date</th>
                </tr>
            </thead>
            <tbody>
                {accessionQueries.map((accessionQuery, index) => {
                    const accessionData = accessionQuery.data;
                    return (
                        <tr key={`accessionData-${index}`}>
                            <td className='text-left'>
                                <Button
                                    href={`/sequences/${accessionData?.genbankAccession}`}
                                    target='_blank'
                                    variant='text'
                                    sx={{ padding: 0, margin: 0 }}
                                >
                                    {accessionData?.genbankAccession ?? 'N/A'}
                                </Button>
                            </td>
                            <td className='text-left'>
                                <Button
                                    href={`/sequences/${accessionData?.sraAccession}`}
                                    target='_blank'
                                    variant='text'
                                    sx={{ padding: 0, margin: 0 }}
                                >
                                    {accessionData?.sraAccession ?? 'N/A'}
                                </Button>
                            </td>
                            <td className='text-left'>{accessionData?.strain ?? 'N/A'}</td>
                            <td className='text-left'>{accessionData?.country ?? 'N/A'}</td>
                            <td className='text-left'>{accessionData?.date ?? 'N/A'}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};

const DatasetItemInner: FC<DatasetItemProps> = ({ datasetId, config, clientConfig, isAdminView = false }) => {
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
    const [doiDialogVisible, setDoiDialogVisible] = useState(false);
    const [citationsDialogVisible, setCitationsDialogVisible] = useState(false);
    const [exportModalVisible, setExportModalVisible] = useState(false);

    const [isErrorOpen, setIsErrorOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // TODO: centralize this into an ErrorBoundary component (react-error-boundary)
    const handleOpenError = (message: string) => {
        setErrorMessage(message);
        setIsErrorOpen(true);
    };
    const handleCloseError = () => {
        setErrorMessage('');
        setIsErrorOpen(false);
    };

    const { data: dataset, isLoading: isLoadingDataset }: UseQueryResult = useQuery(['dataset', datasetId], () =>
        fetchDataset(datasetId, clientConfig),
    );

    const fetchAccessionDetails = async (sequence: DatasetAccession) => {
        let accessionConfig: Config = config;
        let accession = sequence.genbankAccession ?? '';
        if (sequence.sraAccession != null) {
            accessionConfig = {
                ...config,
                schema: {
                    ...config.schema,
                    primaryKey: 'sraAccession',
                },
            };
            accession = sequence.sraAccession;
        }
        try {
            const response = await fetchSequenceDetails(accession, accessionConfig, clientConfig);
            await clientLogger.info(`fetchSequenceDetails succeeded for ${accession}`);
            return response;
        } catch (error) {
            handleOpenError(`fetchSequenceDetails failed with error' + ${(error as Error).message}`);
            await clientLogger.error(`fetchSequenceDetails failed with error' + ${(error as Error).message}`);
        }
    };

    const accessionQueries = useQueries({
        queries:
            dataset != null
                ? dataset.sequences?.map((sequence) => ({
                      queryKey: ['accessionDetails', sequence.sequenceId],
                      queryFn: () => fetchAccessionDetails(sequence),
                  }))
                : [],
    });

    const deleteDatasetMutation = useMutation({
        mutationFn: () => deleteDataset(datasetId, clientConfig),
    });

    const handleDeleteDataset = async () => {
        const response = await deleteDatasetMutation.mutateAsync();
        if (response.status === 200) {
            await clientLogger.info(`deleteDataset succeeded for ${datasetId}`);
            location.href = '/datasets';
            return;
        }
        handleOpenError(`fetchSequenceDetails failed with error' + ${(error as Error).message}`);
        await clientLogger.error(`deleteDataset failed with error' + ${(response as Error).message}`);
    };

    // TODO: implement
    const handleCreateDOI = () => {
        return true;
    };

    // TODO: implement
    const handleCitationsClose = () => {
        return true;
    };

    return (
        <div className='flex flex-col items-left'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={handleCloseError} />
            {isLoadingDataset ? (
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
                        <h1 className='text-2xl font-semibold pb-8'>{dataset?.name}</h1>
                    </div>
                    <hr />
                    <div className='flex flex-col my-4'>
                        <div className='flex flex-row'>
                            <p className='mr-8 font-medium w-[150px] text-right'>Description: </p>
                            <p className='text'>{dataset?.description ?? 'N/A'}</p>
                        </div>
                        <div className='flex flex-row'>
                            <p className='mr-8 font-medium w-[150px] text-right'>Version: </p>
                            <p className='text'>{dataset?.version ?? 'N/A'}</p>
                        </div>
                        <div className='flex flex-row'>
                            <p className='mr-8 font-medium w-[150px] text-right'>Created Dated: </p>
                            <p className='text'>{dataset?.createdDate ?? 'N/A'}</p>
                        </div>
                        <div className='flex flex-row'>
                            <p className='mr-8 font-medium w-[150px] text-right'>Last Modified: </p>
                            <p className='text'>{dataset?.lastModifiedDate ?? 'N/A'}</p>
                        </div>
                        <div className='flex flex-row'>
                            <p className='mr-8 font-medium w-[150px] text-right'>DOI: </p>
                            <p className='text'>{dataset?.datasetDOI ?? 'N/A'}</p>
                            {dataset?.datasetDOI == null ? (
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
                    <div className='flex flex-col my-4'>
                        <p className='text-xl py-4 font-semibold'>Sequences</p>
                        <SequencesTable accessionQueries={accessionQueries} />
                    </div>
                </>
            )}
            <Modal isModalVisible={editModalVisible} setModalVisible={setEditModalVisible}>
                <DatasetForm editDataset={dataset} config={config} clientConfig={clientConfig} />
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
        </div>
    );
};

export const DatasetItem = withQueryProvider(DatasetItemInner);
