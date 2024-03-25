import { type FC, useState } from 'react';

import { ExportSeqSet } from './ExportSeqSet';
import { SeqSetForm } from './SeqSetForm';
import { getClientLogger } from '../../clientLogger';
import { seqSetCitationClientHooks } from '../../services/serviceHooks';
import type { ClientConfig } from '../../types/runtimeConfig';
import type { SeqSetRecord, SeqSet } from '../../types/seqSetCitation';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback';
import Modal from '../common/Modal';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

const logger = getClientLogger('SeqSetItemActions');

type SeqSetItemActionsProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    seqSet: SeqSet;
    seqSetRecords: SeqSetRecord[];
    isAdminView?: boolean;
};

const SeqSetItemActionsInner: FC<SeqSetItemActionsProps> = ({
    clientConfig,
    accessToken,
    seqSet,
    seqSetRecords,
    isAdminView = false,
}) => {
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [exportModalVisible, setExportModalVisible] = useState(false);
    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();

    const { mutate: deleteSeqSet } = useDeleteSeqSetAction(
        clientConfig,
        accessToken,
        seqSet.seqSetId,
        seqSet.seqSetVersion,
        openErrorFeedback,
    );

    const handleDeleteSeqSet = async () => {
        deleteSeqSet(undefined);
    };

    return (
        <div className='flex flex-col items-left'>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />
            <div className='flex-row items-center justify-between w-full'>
                <div className='flex justify-start items-center pt-4 pb-8'>
                    <div className='pr-2'>
                        <button className='btn' onClick={() => setExportModalVisible(true)}>
                            Export
                        </button>
                    </div>
                    <div className='px-2'>
                        {isAdminView ? (
                            <button className='btn' onClick={() => setEditModalVisible(true)}>
                                Edit
                            </button>
                        ) : null}
                    </div>
                    <div className='px-2'>
                        {isAdminView && (seqSet.seqSetDOI === null || seqSet.seqSetDOI === undefined) ? (
                            <button
                                className='btn'
                                onClick={() =>
                                    displayConfirmationDialog({
                                        dialogText: `Are you sure you want to delete this seqSet version?`,
                                        onConfirmation: handleDeleteSeqSet,
                                    })
                                }
                            >
                                Delete
                            </button>
                        ) : null}
                    </div>
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
                <ExportSeqSet seqSet={seqSet} seqSetRecords={seqSetRecords} />
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
                window.location.href = '/seqSets';
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
