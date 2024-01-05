import { type FC, useState } from 'react';
import AddBoxIcon from '~icons/ic/baseline-library-add';
import IconButton from '@mui/material/IconButton';
import DatasetsTable from './Table';
import Modal from '../common/Modal';
import { DatasetForm } from './DatasetForm';
import type { ClientConfig } from '../../types/runtimeConfig';
import { Dataset } from '../../types/datasets';

type DatasetListProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    datasets: Dataset[];
};

export const DatasetList: FC<DatasetListProps> = ({ clientConfig, accessToken, datasets }) => {
    const [createModalVisible, setCreateModalVisible] = useState(false);

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
                    <DatasetsTable datasets={datasets} />
                </div>
            </div>
            <Modal isModalVisible={createModalVisible} setModalVisible={setCreateModalVisible}>
                <DatasetForm clientConfig={clientConfig} accessToken={accessToken} />
            </Modal>
        </div>
    );
};
