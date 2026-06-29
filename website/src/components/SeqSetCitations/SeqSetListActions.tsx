import { type FC, useState } from 'react';

import { SeqSetForm } from './SeqSetForm';
import type { ClientConfig } from '../../types/runtimeConfig';
import { BaseDialog } from '../common/BaseDialog';
import { Button } from '../common/Button';
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
                    size='sm'
                    variant='primary'
                    className='flex items-center gap-1'
                    onClick={() => setCreateModalVisible(true)}
                >
                    <AddBoxIcon className='w-4 h-4' />
                    Create SeqSet
                </Button>
            </div>
            <BaseDialog
                title=''
                isOpen={createModalVisible}
                onClose={() => setCreateModalVisible(false)}
                fullWidth={false}
                dismissible={false}
                className='max-w-3xl'
            >
                <SeqSetForm clientConfig={clientConfig} accessToken={accessToken} />
            </BaseDialog>
        </>
    );
};

export const SeqSetListActions = withQueryProvider(SeqSetListActionsInner);
