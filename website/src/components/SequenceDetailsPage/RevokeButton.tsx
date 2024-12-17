import { type FC, useState } from 'react';
import { confirmAlert } from 'react-confirm-alert';
import { toast } from 'react-toastify';

import { routes } from '../../routes/routes';
import { backendClientHooks } from '../../services/serviceHooks';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError';
import { withQueryProvider } from '../common/withQueryProvider';

type RevokeSequenceEntryProps = {
    organism: string;
    accessToken: string;
    clientConfig: ClientConfig;
    accessionVersion: string;
    groupId: number;
};

// function useRevokeSequences(
function useRevokeSequences(clientConfig: ClientConfig, accessToken: string, organism: string, groupId: number) {
    return backendClientHooks(clientConfig).useRevokeSequences(
        {
            headers: createAuthorizationHeader(accessToken),
            params: { organism },
        },
        {
            onSuccess: () => {
                document.location = routes.userSequenceReviewPage(organism, groupId);
            },
            onError: (error) =>
                toast.error(getRevokeSequenceEntryErrorMessage(error), {
                    position: 'top-center',
                    autoClose: false,
                }),
        },
    );
}

const InnerRevokeButton: FC<RevokeSequenceEntryProps> = ({
    organism,
    accessToken,
    clientConfig,
    accessionVersion,
    groupId,
}) => {
    const { mutate } = useRevokeSequences(clientConfig, accessToken, organism, groupId);
    const handleRevokeSequenceEntry = (inputValue: string) => {
        mutate({ accessions: [accessionVersion], versionComment: inputValue });
    };

    return (
        <button
            className='btn btn-sm  bg-red-400'
            onClick={() =>
                displayRevocationDialog({
                    dialogText: 'Are you sure you want to create a revocation for this sequence?',
                    onConfirmation: handleRevokeSequenceEntry,
                })
            }
        >
            Revoke this sequence
        </button>
    );
};

interface DisplayRevocationProps {
    dialogText: string;
    onConfirmation: (inputValue: string) => void;
}

export const displayRevocationDialog = ({ dialogText, onConfirmation }: DisplayRevocationProps) => {
    confirmAlert({
        closeOnClickOutside: true,

        customUI: ({ onClose }) => (
            <RevocationDialog
                dialogText={dialogText}
                onConfirmation={async (inputValue) => {
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

export const RevocationDialog: React.FC<RevocationDialogProps> = ({ dialogText, onConfirmation, onClose }) => {
    const [inputValue, setInputValue] = useState('');

    return (
        <div className='modal-box'>
            <form method='dialog'>
                <button className='btn btn-sm btn-circle btn-ghost absolute right-2 top-2' onClick={onClose}>
                    ✕
                </button>
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
                    <button className='btn loculusColor text-white hover:bg-primary-700' onClick={onClose}>
                        Cancel
                    </button>
                </form>
                <form method='dialog'>
                    <button
                        className='btn loculusColor text-white hover:bg-primary-700'
                        onClick={(e) => {
                            e.preventDefault();
                            onConfirmation(inputValue);
                        }}
                    >
                        Confirm
                    </button>
                </form>
            </div>
        </div>
    );
};

export const RevokeButton = withQueryProvider(InnerRevokeButton);

function getRevokeSequenceEntryErrorMessage(error: unknown) {
    return 'Failed to revoke sequence entry: ' + stringifyMaybeAxiosError(error);
}
