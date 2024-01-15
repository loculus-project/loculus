import { type FC, useState } from 'react';
import AddBoxIcon from '~icons/ic/baseline-library-add';
import IconButton from '@mui/material/IconButton';
import Modal from '../common/Modal';
import { DatasetForm } from './DatasetForm';
import type { ClientConfig } from '../../types/runtimeConfig';
import type { Dataset } from '../../types/datasets';
import { withQueryProvider } from '../common/withQueryProvider.tsx';


type DatasetListActionsProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    datasets: Dataset[];
};

const DatasetListActionsInner: FC<DatasetListActionsProps> = ({ clientConfig, accessToken, datasets }) => {
    const [createModalVisible, setCreateModalVisible] = useState(false);

    return (
        <>
            <IconButton onClick={() => setCreateModalVisible(true)}>
                <AddBoxIcon fontSize='large' sx={{ color: 'grey' }} />
            </IconButton>
            <Modal isModalVisible={createModalVisible} setModalVisible={setCreateModalVisible}>
                <DatasetForm clientConfig={clientConfig} accessToken={accessToken} />
            </Modal>
        </>
    );
};

export const DatasetListActions = withQueryProvider(DatasetListActionsInner);
