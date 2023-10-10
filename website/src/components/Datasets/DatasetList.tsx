import AddBoxIcon from '@mui/icons-material/AddToPhotos';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { type FC, useState } from 'react';

import { DatasetForm } from './DatasetForm';
import DatasetsTable from './Table';
import { fetchAuthorDatasets } from './api';
import type { Config, ClientConfig, Dataset } from '../../types';
import Modal from '../common/Modal';
import withQueryProvider from '../common/withQueryProvider';

type DatasetListProps = {
    config: Config;
    clientConfig: ClientConfig;
};

const DatasetListInner: FC<DatasetListProps> = ({ config, clientConfig }) => {
    const [createModalVisible, setCreateModalVisible] = useState(false);

    // TODO: replace with actual user id
    const userId = 'testuser';
    const { data: datasets, isLoading: isLoadingDatasets }: UseQueryResult<Dataset[]> = useQuery(
        ['datasets', userId],
        () => fetchAuthorDatasets(userId, clientConfig),
    );

    return (
        <div className='flex justify-center'>
            <div className='w-3/4'>
                <div className='flex justify-start items-center py-5 '>
                    <h1 className='pr-4 text-2xl font-semibold'>Datasets</h1>
                    <IconButton onClick={() => setCreateModalVisible(true)}>
                        <AddBoxIcon fontSize='large' sx={{ color: 'grey' }} />
                    </IconButton>
                </div>
                <div>
                    {isLoadingDatasets ? (
                        <CircularProgress />
                    ) : datasets != null && datasets?.length > 0 ? (
                        <DatasetsTable datasets={datasets} />
                    ) : (
                        'You have no datasets yet.'
                    )}
                </div>
            </div>
            <Modal isModalVisible={createModalVisible} setModalVisible={setCreateModalVisible}>
                <DatasetForm userId={userId} config={config} clientConfig={clientConfig} />
            </Modal>
        </div>
    );
};

export const DatasetList = withQueryProvider(DatasetListInner);
