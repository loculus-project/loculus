import { type FC, useState } from 'react';

import { SeqSetForm } from './SeqSetForm';
import { Button } from '../common/Button';
import Modal from '../common/Modal';
import { withQueryProvider } from '../common/withQueryProvider';
import AddBoxIcon from '~icons/ic/baseline-library-add';

const SeqSetListActionsInner: FC = () => {
    const [createModalVisible, setCreateModalVisible] = useState(false);

    return (
        <>
            <div className='pl-2 ml-auto'>
                <Button
                    data-testid='AddIcon'
                    size='sm'
                    variant='primary'
                    className='flex items-center gap-1'
                    onClick={() => setCreateModalVisible(true)}
                >
                    <AddBoxIcon className='w-4 h-4' />
                    Create SeqSet
                </Button>
            </div>
            <Modal isModalVisible={createModalVisible} setModalVisible={setCreateModalVisible}>
                <SeqSetForm />
            </Modal>
        </>
    );
};

export const SeqSetListActions = withQueryProvider(SeqSetListActionsInner);
