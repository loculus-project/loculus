import { type FC, useEffect, useState } from 'react';

import { SeqSetForm } from './SeqSetForm';
import type { ClientConfig } from '../../types/runtimeConfig';
import { Button } from '../common/Button';
import Modal from '../common/Modal';
import { withQueryProvider } from '../common/withQueryProvider';
import AddBoxIcon from '~icons/ic/baseline-library-add';

type SeqSetListActionsProps = {
    clientConfig: ClientConfig;
    accessToken: string;
};

const SeqSetListActionsInner: FC<SeqSetListActionsProps> = ({ clientConfig, accessToken }) => {
    const [createModalVisible, setCreateModalVisible] = useState(false);

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('draft') === 'true') {
            setCreateModalVisible(true);
        }
    }, []);

    const setModalVisible = (isVisible: boolean) => {
        setCreateModalVisible(isVisible);
        const url = new URL(window.location.href);

        if (isVisible) url.searchParams.set('draft', 'true');
        else url.searchParams.delete('draft');

        window.history.replaceState(null, '', url);
    };

    return (
        <>
            <div className='pl-2 ml-auto'>
                <Button
                    data-testid='AddIcon'
                    size='sm'
                    variant='primary'
                    className='flex items-center gap-1'
                    onClick={() => setModalVisible(true)}
                >
                    <AddBoxIcon className='w-4 h-4' />
                    Create SeqSet
                </Button>
            </div>
            <Modal isModalVisible={createModalVisible} setModalVisible={setModalVisible}>
                <SeqSetForm clientConfig={clientConfig} accessToken={accessToken} />
            </Modal>
        </>
    );
};

export const SeqSetListActions = withQueryProvider(SeqSetListActionsInner);
