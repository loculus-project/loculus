import { type FC, useState } from 'react';
import { confirmAlert } from 'react-confirm-alert';
import { toast } from 'react-toastify';

import { backendClientHooks } from '../../services/serviceHooks';
import { approveAllDataScope } from '../../types/backend';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError';
import { Button } from '../common/Button';
import { buttonClasses } from '../common/buttonStyles';
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

    return (
        <Button
            className={buttonClasses({ size: 'sm', variant: 'unstyled', className: 'bg-red-400' })}
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

export const displayRevocationDialog = ({ dialogText, onConfirmation }: DisplayRevocationProps) => {
    confirmAlert({
        closeOnClickOutside: false,
        // Make the overlay an open daisyUI modal so the `.modal-box` child is visible.
        overlayClassName: 'modal modal-open',

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

export const RevocationDialog: FC<RevocationDialogProps> = ({ dialogText, onConfirmation, onClose }) => {
    const [inputValue, setInputValue] = useState('');

    return (
        <div className='modal-box'>
            <form method='dialog'>
                <Button
                    className={buttonClasses({
                        size: 'sm',
                        circle: true,
                        variant: 'ghost',
                        className: 'absolute right-2 top-2',
                    })}
                    onClick={onClose}
                >
                    ✕
                </Button>
            </form>
            <h3 className='font-bold text-lg'>{dialogText}</h3>
            <input
                type='text'
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder='Enter reason for revocation'
                className='mt-4 w-11/12 mx-auto block'
            />
            <div className='flex justify-end gap-4 mt-4'>
                <form method='dialog'>
                    <Button className={buttonClasses({ variant: 'primary' })} onClick={onClose}>
                        Cancel
                    </Button>
                </form>
                <form method='dialog'>
                    <Button
                        className={buttonClasses({ variant: 'primary' })}
                        onClick={(e) => {
                            e.preventDefault();
                            onConfirmation(inputValue);
                        }}
                    >
                        Confirm
                    </Button>
                </form>
            </div>
        </div>
    );
};

export const RevokeButton = withQueryProvider(InnerRevokeButton);

function getRevokeSequenceEntryErrorMessage(error: unknown) {
    return 'Failed to revoke sequence entry: ' + stringifyMaybeAxiosError(error);
}

function getApproveRevocationErrorMessage(error: unknown) {
    return 'Failed to approve revocation: ' + stringifyMaybeAxiosError(error);
}
