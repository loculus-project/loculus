import { type FC } from 'react';
import { toast } from 'react-toastify';

import { routes } from '../../routes/routes';
import { backendClientHooks } from '../../services/serviceHooks';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError';
import { displayConfirmationDialog } from '../ConfirmationDialog';
import { withQueryProvider } from '../common/withQueryProvider';

type RevokeSequenceEntryProps = {
    organism: string;
    accessToken: string;
    clientConfig: ClientConfig;
    accessionVersion: string;
    groupId: number;
};

const InnerRevokeButton: FC<RevokeSequenceEntryProps> = ({
    organism,
    accessToken,
    clientConfig,
    accessionVersion,
    groupId,
}) => {
    const hooks = backendClientHooks(clientConfig);
    const useRevokeSequenceEntries = hooks.useRevokeSequences(
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

    const handleRevokeSequenceEntry = () => {
        useRevokeSequenceEntries.mutate({ accessions: [accessionVersion], revocationComments: 'website revocation' });
    };

    return (
        <button
            className='btn btn-sm  bg-red-400'
            onClick={() =>
                displayConfirmationDialog({
                    dialogText: 'Are you sure you want to create a revocation for this sequence?',
                    onConfirmation: handleRevokeSequenceEntry,
                })
            }
        >
            Revoke this sequence
        </button>
    );
};

export const RevokeButton = withQueryProvider(InnerRevokeButton);

function getRevokeSequenceEntryErrorMessage(error: unknown) {
    return 'Failed to revoke sequence entry: ' + stringifyMaybeAxiosError(error);
}
