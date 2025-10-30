import { type FC, useState } from 'react';
import { Button } from "src/components/common/Button";

import { SeqSetForm } from './SeqSetForm';
import type { ClientConfig } from '../../types/runtimeConfig';
import Modal from '../common/Modal';
import { withQueryProvider } from '../common/withQueryProvider';
import AddBoxIcon from '~icons/ic/baseline-library-add';

type SeqSetListActionsProps = {
    clientConfig: ClientConfig;
    accessToken: string;
};

const SeqSetListActionsInner: FC<SeqSetListActionsProps> = ({ clientConfig, accessToken }) => {
    const [createModalVisible, setCreateModalVisible] = useState(false);

    return (
        <>
            <div className='pl-2 ml-auto'>
                <Button
                    data-testid='AddIcon'
                    className='btn btn-sm loculusColor text-white flex items-center gap-1'
                    onClick={() => setCreateModalVisible(true)}
                >
                    <AddBoxIcon fontSize='large' />
                    Create SeqSet
                </Button>
            </div>
            <Modal isModalVisible={createModalVisible} setModalVisible={setCreateModalVisible}>
                <SeqSetForm clientConfig={clientConfig} accessToken={accessToken} />
            </Modal>
        </>
    );
};

export const SeqSetListActions = withQueryProvider(SeqSetListActionsInner);
