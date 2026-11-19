import { type FC, useState } from 'react';
import { confirmAlert } from 'react-confirm-alert';
import { toast } from 'react-toastify';

import { useBackendMutation } from '../../hooks/useBackend.ts';
import { getErrorMessage } from '../../services/apiRequest.ts';
import { approveAllDataScope } from '../../types/backend';
import { Button } from '../common/Button';
import { ModalBox } from '../common/ModalBox';
import { withQueryProvider } from '../common/withQueryProvider';

type RevokeSequenceEntryProps = {
    organism: string;
    accession: string;
    groupId: number;
    onRevokeSuccess?: () => void;
};

const REVOCATION_TOAST_ID = 'revocation-toast';

const InnerRevokeButton: FC<RevokeSequenceEntryProps> = ({ organism, accession, groupId, onRevokeSuccess }) => {
    const useApproveProcessedData = useBackendMutation('approveProcessedData', {
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
    });

    const useRevokeSequenceEntries = useBackendMutation('revoke', {
        onSuccess: (data) => {
            useApproveProcessedData.mutate({
                organism,
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
    });

    const handleRevokeSequenceEntry = (inputValue: string) => {
        toast.loading('Revoking sequence...', {
            toastId: REVOCATION_TOAST_ID,
            position: 'top-center',
        });
        useRevokeSequenceEntries.mutate({ organism, accessions: [accession], versionComment: inputValue });
    };

    return (
        <Button
            size='sm'
            variant='unstyled'
            className='bg-red-400'
            onClick={() =>
                displayRevocationDialog({
                    dialogText: 'Are you sure you want to revoke this sequence?',
                    onConfirmation: handleRevokeSequenceEntry,
                })
            }
        >
            Revoke this sequence
        </Button>
    );
};

interface DisplayRevocationProps {
    dialogText: string;
    onConfirmation: (inputValue: string) => void;
}

const displayRevocationDialog = ({ dialogText, onConfirmation }: DisplayRevocationProps) => {
    confirmAlert({
        closeOnClickOutside: false,
        customUI: ({ onClose }) => (
            <RevocationDialog
                dialogText={dialogText}
                onConfirmation={(inputValue) => {
                    onConfirmation(inputValue);
                    onClose();
                }}
                onClose={onClose}
            />
        ),
    });
};

interface RevocationDialogProps {
    dialogText: string;
    onConfirmation: (inputValue: string) => void;
    onClose: () => void;
}

const RevocationDialog: FC<RevocationDialogProps> = ({ dialogText, onConfirmation, onClose }) => {
    const [inputValue, setInputValue] = useState('');

    return (
        <ModalBox>
            <form method='dialog'>
                <Button size='sm' circle variant='ghost' className='absolute right-2 top-2' onClick={onClose}>
                    ✕
                </Button>
            </form>
            <h3 className='font-bold text-lg pr-8'>{dialogText}</h3>
            <input
                type='text'
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder='Enter reason for revocation'
                className='mt-4 w-11/12 mx-auto block'
            />
            <div className='flex justify-end gap-4 mt-4'>
                <form method='dialog'>
                    <Button variant='primary' onClick={onClose}>
                        Cancel
                    </Button>
                </form>
                <form method='dialog'>
                    <Button
                        variant='primary'
                        onClick={(e) => {
                            e.preventDefault();
                            onConfirmation(inputValue);
                        }}
                    >
                        Confirm
                    </Button>
                </form>
            </div>
        </ModalBox>
    );
};

export const RevokeButton = withQueryProvider(InnerRevokeButton);

function getRevokeSequenceEntryErrorMessage(error: unknown) {
    return 'Failed to revoke sequence entry: ' + getErrorMessage(error);
}

function getApproveRevocationErrorMessage(error: unknown) {
    return 'Failed to approve revocation: ' + getErrorMessage(error);
}
