import AddBoxIcon from '@mui/icons-material/AddToPhotos';
import IconButton from '@mui/material/IconButton';
import { type FC, useState } from 'react';

import { DatasetForm } from './DatasetForm';
import EnhancedTable from './Table';
import type { Config, ClientConfig } from '../../types';
import Modal from '../common/Modal';
import withQueryProvider from '../common/withQueryProvider';

type DatasetListProps = {
    config: Config;
    clientConfig: ClientConfig;
};

const DatasetListInner: FC<DatasetListProps> = ({ config, clientConfig }) => {
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
                    <EnhancedTable />
                </div>
            </div>
            <Modal isModalVisible={createModalVisible} setModalVisible={setCreateModalVisible}>
                <DatasetForm config={config} clientConfig={clientConfig} />
            </Modal>
        </div>
    );
};

export const DatasetList = withQueryProvider(DatasetListInner);
