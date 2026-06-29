import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { backendClientHooks } from '../../services/serviceHooks';
import { approveAllDataScope } from '../../types/backend';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError';
import { BaseDialog } from '../common/BaseDialog';
import { Button } from '../common/Button';
import { withQueryProvider } from '../common/withQueryProvider';

type RevokeSequenceEntryProps = {
    organism: string;
    accessToken: string;
    clientConfig: ClientConfig;
    accessionVersion: string;
    groupId: number;
    onRevokeSuccess?: () => void;
};

const REVOCATION_TOAST_ID = 'revocation-toast';

const InnerRevokeButton: FC<RevokeSequenceEntryProps> = ({
    organism,
    accessToken,
    clientConfig,
    accessionVersion,
    groupId,
    onRevokeSuccess,
}) => {
    const hooks = backendClientHooks(clientConfig);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [versionComment, setVersionComment] = useState('');

    const useApproveProcessedData = hooks.useApproveProcessedData(
        {
            headers: createAuthorizationHeader(accessToken),
            params: { organism },
        },
        {
            onSuccess: () => {
                toast.update(REVOCATION_TOAST_ID, {
                    render: 'Sequence revoked successfully. This may take several minutes to become visible on the website.',
                    type: 'success',
                    isLoading: false,
                    autoClose: 4000,
                });
                onRevokeSuccess?.();
            },
            onError: (error) => {
                toast.update(REVOCATION_TOAST_ID, {
                    render: getApproveRevocationErrorMessage(error),
                    type: 'error',
                    isLoading: false,
                    autoClose: false,
                });
            },
        },
    );

    const useRevokeSequenceEntries = hooks.useRevokeSequences(
        {
            headers: createAuthorizationHeader(accessToken),
            params: { organism },
        },
        {
            onSuccess: (data) => {
                useApproveProcessedData.mutate({
                    accessionVersionsFilter: data.map(({ accession, version }) => ({ accession, version })),
                    groupIdsFilter: [groupId],
                    scope: approveAllDataScope.value,
                });
            },
            onError: (error) => {
                toast.update(REVOCATION_TOAST_ID, {
                    render: getRevokeSequenceEntryErrorMessage(error),
                    type: 'error',
                    isLoading: false,
                    autoClose: false,
                });
            },
        },
    );

    const handleRevokeSequenceEntry = (inputValue: string) => {
        toast.loading('Revoking sequence...', {
            toastId: REVOCATION_TOAST_ID,
            position: 'top-center',
        });
        useRevokeSequenceEntries.mutate({ accessions: [accessionVersion], versionComment: inputValue });
    };

    const closeDialog = () => {
        setIsDialogOpen(false);
        setVersionComment('');
    };

    return (
        <>
            <Button size='sm' variant='unstyled' className='bg-red-400' onClick={() => setIsDialogOpen(true)}>
                Revoke this sequence
            </Button>
            <BaseDialog title='' isOpen={isDialogOpen} onClose={closeDialog} fullWidth={false} dismissible={false}>
                <h3 className='font-bold text-lg pr-8'>Are you sure you want to revoke this sequence?</h3>
                <input
                    type='text'
                    value={versionComment}
                    onChange={(e) => setVersionComment(e.target.value)}
                    placeholder='Enter reason for revocation'
                    className='mt-4 w-11/12 mx-auto block'
                />
                <div className='flex justify-end gap-4 mt-4'>
                    <Button variant='primary' onClick={closeDialog}>
                        Cancel
                    </Button>
                    <Button
                        variant='primary'
                        onClick={() => {
                            handleRevokeSequenceEntry(versionComment);
                            closeDialog();
                        }}
                    >
                        Confirm
                    </Button>
                </div>
            </BaseDialog>
        </>
    );
};

export const RevokeButton = withQueryProvider(InnerRevokeButton);

function getRevokeSequenceEntryErrorMessage(error: unknown) {
    return 'Failed to revoke sequence entry: ' + stringifyMaybeAxiosError(error);
}

function getApproveRevocationErrorMessage(error: unknown) {
    return 'Failed to approve revocation: ' + stringifyMaybeAxiosError(error);
}
