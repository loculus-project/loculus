import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { AuthorDetails } from './AuthorDetails.tsx';
import { ExportSeqSet } from './ExportSeqSet';
import { SeqSetForm } from './SeqSetForm';
import { getClientLogger } from '../../clientLogger';
import { seqSetCitationClientHooks } from '../../services/serviceHooks';
import type { ClientConfig } from '../../types/runtimeConfig';
import type { AuthorProfile, SeqSetRecord, SeqSet } from '../../types/seqSetCitation';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { getAccessionVersionString } from '../../utils/extractAccessionVersion.ts';
import { useConfirmDialog } from '../ConfirmationDialog.tsx';
import { CitationTable } from './CitationTable.tsx';
import { BaseDialog } from '../common/BaseDialog.tsx';
import { Button } from '../common/Button';
import { withQueryProvider } from '../common/withQueryProvider.tsx';
import MdiDelete from '~icons/mdi/delete';
import MdiDownload from '~icons/mdi/download';
import MdiInformationOutline from '~icons/mdi/information-outline';
import MdiPencil from '~icons/mdi/pencil';
import MdiViewListOutline from '~icons/mdi/view-list-outline';

const logger = getClientLogger('SeqSetItemActions');

const CreatorDetailEntry: FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className='flex flex-row py-1.5'>
        <div className='mr-8 w-[120px] text-gray-500'>{label}</div>
        <div>{value}</div>
    </div>
);

type SeqSetItemActionsProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    seqSet: SeqSet;
    seqSetAuthor?: AuthorProfile;
    seqSetRecords: SeqSetRecord[];
    isAdminView?: boolean;
    databaseName: string;
};

const SeqSetItemActionsInner: FC<SeqSetItemActionsProps> = ({
    clientConfig,
    accessToken,
    seqSet,
    seqSetAuthor,
    seqSetRecords,
    isAdminView = false,
    databaseName,
}) => {
    const seqSetAccessionVersion = getAccessionVersionString({
        accession: seqSet.seqSetId,
        version: seqSet.seqSetVersion,
    });

    const [editModalVisible, setEditModalVisible] = useState(false);
    const [exportModalVisible, setExportModalVisible] = useState(false);
    const [citationsModalVisible, setCitationsModalVisible] = useState(false);
    const [creatorInfoVisible, setCreatorInfoVisible] = useState(false);
    const { confirm, confirmDialog } = useConfirmDialog();

    const {
        isLoading: isSeqSetCitationsLoading,
        error: seqSetCitationsError,
        data: seqSetCitations,
    } = seqSetCitationClientHooks(clientConfig).useGetSeqSetCitations({
        params: { seqSetId: seqSet.seqSetId, version: seqSet.seqSetVersion },
    });

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

    const formatDate = (date?: string) => {
        if (date === undefined) {
            return 'N/A';
        }
        return new Date(date).toISOString().split('T')[0];
    };

    const createdByValue = seqSetAuthor ? (
        <AuthorDetails displayFullDetails={false} firstName={seqSetAuthor.firstName} lastName={seqSetAuthor.lastName} />
    ) : (
        'Unknown'
    );

    return (
        <div className='flex justify-between flex-wrap'>
            <div className='flex flex-row pb-6'>
                <h1 className='title'> {seqSetAccessionVersion}</h1>
            </div>
            <div className='inline-block ml-auto'>
                <div className='flex justify-start items-center pb-8 gap-2'>
                    <Button
                        variant='outline'
                        className='flex items-center gap-2'
                        onClick={() => setExportModalVisible(true)}
                    >
                        <MdiDownload className='w-4 h-4' />
                        <span className='hidden sm:block'>Export / Cite</span>
                    </Button>
                    <Button
                        variant='outline'
                        className='flex items-center gap-2'
                        onClick={() => setCreatorInfoVisible(true)}
                    >
                        <MdiInformationOutline className='w-4 h-4' />
                        <span className='hidden sm:block'>More details</span>
                    </Button>
                    <Button
                        variant='outline'
                        className='flex items-center gap-2'
                        onClick={() => setCitationsModalVisible(true)}
                    >
                        <MdiViewListOutline className='w-4 h-4' />
                        <span className='hidden sm:block'>View Citations ({seqSetCitations?.length ?? 0})</span>
                    </Button>
                    {isAdminView ? (
                        <Button
                            variant='outline'
                            className='flex items-center gap-2'
                            onClick={() => setEditModalVisible(true)}
                        >
                            <MdiPencil className='w-4 h-4' />
                            <span className='hidden sm:block'>Edit</span>
                        </Button>
                    ) : null}
                    {isAdminView && (seqSet.seqSetDOI === null || seqSet.seqSetDOI === undefined) ? (
                        <Button
                            variant='outline'
                            className='flex items-center gap-2'
                            onClick={() =>
                                confirm({
                                    dialogText: `Are you sure you want to delete this seqSet version?`,
                                    onConfirmation: handleDeleteSeqSet,
                                })
                            }
                        >
                            <MdiDelete className='w-4 h-4' />
                            <span className='hidden sm:block'>Delete</span>
                        </Button>
                    ) : null}
                </div>
            </div>
            <BaseDialog
                isOpen={editModalVisible}
                onClose={() => setEditModalVisible(false)}
                title=''
                fullWidth={false}
                dismissible={false}
                className='min-h-[60vh]'
            >
                <div className='min-w-[1000px]'></div>
                <SeqSetForm
                    clientConfig={clientConfig}
                    accessToken={accessToken}
                    editSeqSet={seqSet}
                    editSeqSetRecords={seqSetRecords}
                />
            </BaseDialog>
            <BaseDialog
                isOpen={exportModalVisible}
                onClose={() => setExportModalVisible(false)}
                title=''
                fullWidth={false}
                className='min-h-[60vh]'
            >
                <div className='min-w-[1000px]'></div>
                <ExportSeqSet seqSet={seqSet} seqSetRecords={seqSetRecords} databaseName={databaseName} />
            </BaseDialog>
            <BaseDialog
                isOpen={citationsModalVisible}
                onClose={() => setCitationsModalVisible(false)}
                title='SeqSet Citations'
                fullWidth={false}
                className='min-h-[60vh]'
            >
                <div className='min-w-3xl'></div>
                <CitationTable
                    isLoading={isSeqSetCitationsLoading}
                    error={seqSetCitationsError}
                    citations={seqSetCitations ?? []}
                />
            </BaseDialog>
            <BaseDialog
                title='Creator details'
                isOpen={creatorInfoVisible}
                onClose={() => setCreatorInfoVisible(false)}
                fullWidth={false}
            >
                <p className='mb-4 text-sm text-gray-500'>
                    The creator is the person who assembled this SeqSet on Loculus. They are not necessarily the
                    originator of the underlying sequence data.
                </p>
                <CreatorDetailEntry label='Created by' value={createdByValue} />
                <CreatorDetailEntry label='Created date' value={formatDate(seqSet.createdAt)} />
            </BaseDialog>
            {confirmDialog}
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
