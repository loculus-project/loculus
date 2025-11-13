import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { ExportSeqSet } from './ExportSeqSet';
import { SeqSetForm } from './SeqSetForm';
import { getClientLogger } from '../../clientLogger';
import { seqSetCitationClientHooks } from '../../services/serviceHooks';
import type { ClientConfig } from '../../types/runtimeConfig';
import type { SeqSetRecord, SeqSet } from '../../types/seqSetCitation';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { Button } from '../common/Button';
import Modal from '../common/Modal';
import { withQueryProvider } from '../common/withQueryProvider.tsx';
import MdiDelete from '~icons/mdi/delete';
import MdiDownload from '~icons/mdi/download';
import MdiPencil from '~icons/mdi/pencil';

const logger = getClientLogger('SeqSetItemActions');

type SeqSetItemActionsProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    seqSet: SeqSet;
    seqSetRecords: SeqSetRecord[];
    isAdminView?: boolean;
    databaseName: string;
};

const SeqSetItemActionsInner: FC<SeqSetItemActionsProps> = ({
    clientConfig,
    accessToken,
    seqSet,
    seqSetRecords,
    isAdminView = false,
    databaseName,
}) => {
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [exportModalVisible, setExportModalVisible] = useState(false);

    const { mutate: deleteSeqSet } = useDeleteSeqSetAction(
        clientConfig,
        accessToken,
        seqSet.seqSetId,
        seqSet.seqSetVersion,
        (message) => toast.error(message, { position: 'top-center', autoClose: false }),
    );

    const handleDeleteSeqSet = () => {
        deleteSeqSet(undefined);
    };

    return (
        <div className='flex flex-col items-left'>
            <h1 className='text-2xl font-semibold pb-4'>{seqSet.name}</h1>
            <div className='flex-row items-center justify-between w-full'>
                <div className='flex justify-start items-center pb-8 gap-2'>
                    <Button
                        className='outlineButton flex items-center gap-2'
                        onClick={() => setExportModalVisible(true)}
                    >
                        <MdiDownload className='w-4 h-4' />
                        Export / Cite
                    </Button>
                    {isAdminView ? (
                        <Button
                            className='outlineButton flex items-center gap-2'
                            onClick={() => setEditModalVisible(true)}
                        >
                            <MdiPencil className='w-4 h-4' />
                            Edit
                        </Button>
                    ) : null}
                    {isAdminView && (seqSet.seqSetDOI === null || seqSet.seqSetDOI === undefined) ? (
                        <Button
                            className='outlineButton flex items-center gap-2'
                            onClick={() =>
                                displayConfirmationDialog({
                                    dialogText: `Are you sure you want to delete this seqSet version?`,
                                    onConfirmation: handleDeleteSeqSet,
                                })
                            }
                        >
                            <MdiDelete className='w-4 h-4' />
                            Delete
                        </Button>
                    ) : null}
                </div>
            </div>
            <Modal isModalVisible={editModalVisible} setModalVisible={setEditModalVisible}>
                <SeqSetForm
                    clientConfig={clientConfig}
                    accessToken={accessToken}
                    editSeqSet={seqSet}
                    editSeqSetRecords={seqSetRecords}
                />
            </Modal>
            <Modal isModalVisible={exportModalVisible} setModalVisible={setExportModalVisible}>
                <ExportSeqSet seqSet={seqSet} seqSetRecords={seqSetRecords} databaseName={databaseName} />
            </Modal>
        </div>
    );
};

function useDeleteSeqSetAction(
    clientConfig: ClientConfig,
    accessToken: string,
    seqSetId: string,
    seqSetVersion: number,
    onError: (message: string) => void,
) {
    return seqSetCitationClientHooks(clientConfig).useDeleteSeqSet(
        { headers: createAuthorizationHeader(accessToken), params: { seqSetId, seqSetVersion } },
        {
            onSuccess: async () => {
                await logger.info(`Successfully deleted seqSet with seqSetId: ${seqSetId}, version ${seqSetVersion}`);
                window.location.href = '/seqsets';
            },
            onError: async (error) => {
                const message = `Failed to delete seqSet with error: '${JSON.stringify(error)})}'`;
                await logger.info(message);
                onError(message);
            },
        },
    );
}

export const SeqSetItemActions = withQueryProvider(SeqSetItemActionsInner);
