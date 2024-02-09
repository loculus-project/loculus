import Button from '@mui/material/Button';
import { type FC, useState } from 'react';

import { DatasetForm } from './DatasetForm';
import { ExportDataset } from './ExportDataset';
import { getClientLogger } from '../../clientLogger';
import { datasetCitationClientHooks } from '../../services/serviceHooks';
import type { DatasetRecord, Dataset } from '../../types/datasetCitation';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';
import Modal from '../common/Modal';
import { withQueryProvider } from '../common/withProvider';

const logger = getClientLogger('DatasetItemActions');

type DatasetItemActionsProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    dataset: Dataset;
    datasetRecords: DatasetRecord[];
    isAdminView?: boolean;
};

const DatasetItemActionsInner: FC<DatasetItemActionsProps> = ({
    clientConfig,
    accessToken,
    dataset,
    datasetRecords,
    isAdminView = false,
}) => {
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [exportModalVisible, setExportModalVisible] = useState(false);
    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();

    const { mutate: deleteDataset } = useDeleteDatasetAction(
        clientConfig,
        accessToken,
        dataset.datasetId,
        dataset.datasetVersion,
        openErrorFeedback,
    );

    const handleDeleteDataset = async () => {
        deleteDataset(undefined);
    };

    return (
        <div className='flex flex-col items-left'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />
            <div className='flex-row items-center justify-between w-full'>
                <div className='flex justify-start items-center pt-4 pb-8'>
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
                                onClick={() =>
                                    displayConfirmationDialog({
                                        dialogText: `Are you sure you want to delete this dataset version?`,
                                        onConfirmation: handleDeleteDataset,
                                    })
                                }
                                variant='contained'
                            >
                                Delete
                            </Button>
                        ) : null}
                    </div>
                </div>
            </div>
            <Modal isModalVisible={editModalVisible} setModalVisible={setEditModalVisible}>
                <DatasetForm
                    clientConfig={clientConfig}
                    accessToken={accessToken}
                    editDataset={dataset}
                    editDatasetRecords={datasetRecords}
                />
            </Modal>
            <Modal isModalVisible={exportModalVisible} setModalVisible={setExportModalVisible}>
                <ExportDataset dataset={dataset} datasetRecords={datasetRecords} />
            </Modal>
        </div>
    );
};

function useDeleteDatasetAction(
    clientConfig: ClientConfig,
    accessToken: string,
    datasetId: string,
    datasetVersion: number,
    onError: (message: string) => void,
) {
    return datasetCitationClientHooks(clientConfig).useDeleteDataset(
        { headers: createAuthorizationHeader(accessToken), params: { datasetId, datasetVersion } },
        {
            onSuccess: async () => {
                await logger.info(
                    `Successfully deleted dataset with datasetId: ${datasetId}, version ${datasetVersion}`,
                );
                window.location.href = '/datasets';
            },
            onError: async (error) => {
                const message = `Failed to delete dataset with error: '${JSON.stringify(error)})}'`;
                await logger.info(message);
                onError(message);
            },
        },
    );
}

export const DatasetItemActions = withQueryProvider(DatasetItemActionsInner);
