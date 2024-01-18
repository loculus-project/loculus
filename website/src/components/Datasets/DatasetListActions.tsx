import IconButton from '@mui/material/IconButton';
import { type FC, useState } from 'react';

import { DatasetForm } from './DatasetForm';
import type { ClientConfig } from '../../types/runtimeConfig';
import Modal from '../common/Modal';
import { withQueryProvider } from '../common/withQueryProvider.tsx';
import AddBoxIcon from '~icons/ic/baseline-library-add';

type DatasetListActionsProps = {
    clientConfig: ClientConfig;
    accessToken: string;
};

const DatasetListActionsInner: FC<DatasetListActionsProps> = ({ clientConfig, accessToken }) => {
    const [createModalVisible, setCreateModalVisible] = useState(false);

    return (
        <>
            <div className={'pl-2'}>
                <IconButton onClick={() => setCreateModalVisible(true)}>
                    <AddBoxIcon fontSize='large' />
                </IconButton>
            </div>
            <Modal isModalVisible={createModalVisible} setModalVisible={setCreateModalVisible}>
                <DatasetForm clientConfig={clientConfig} accessToken={accessToken} />
            </Modal>
        </>
    );
};

export const DatasetListActions = withQueryProvider(DatasetListActionsInner);
