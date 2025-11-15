import { useState, type FC } from 'react';
import { toast } from 'react-toastify';

import { backendClientHooks } from '../../services/serviceHooks';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError';
import type { SequenceFilter } from '../SearchPage/DownloadDialog/SequenceFilters';
import { ActiveFilters } from '../common/ActiveFilters';
import { BaseDialog } from '../common/BaseDialog';
import { Button } from '../common/Button';
import WarningAmberIcon from '~icons/ic/baseline-warning-amber';

interface RevokeSequencesModalProps {
    clientConfig: ClientConfig;
    accessToken?: string;
    organism: string;
    sequenceFilter: SequenceFilter;
    accessions: string[];
    totalCount: number;
    isOpen: boolean;
    onClose: () => void;
}

export const RevokeSequencesModal: FC<RevokeSequencesModalProps> = ({
    clientConfig,
    accessToken,
    organism,
    sequenceFilter,
    accessions,
    totalCount,
    isOpen,
    onClose,
}) => {
    const [versionComment, setVersionComment] = useState('');

    const hooks = backendClientHooks(clientConfig);
    const useRevokeSequenceEntries = hooks.useRevokeSequences(
        {
            headers: createAuthorizationHeader(accessToken ?? ''),
            params: { organism },
        },
        {
            onSuccess: () => {
                toast.success('Sequences revoked successfully', {
                    position: 'top-center',
                    autoClose: 5000,
                });
                setVersionComment('');
                onClose();
            },
            onError: (error) =>
                toast.error('Failed to revoke sequences: ' + stringifyMaybeAxiosError(error), {
                    position: 'top-center',
                    autoClose: false,
                }),
        },
    );

    const handleRevoke = () => {
        useRevokeSequenceEntries.mutate({
            accessions,
            versionComment,
        });
    };

    return (
        <BaseDialog title='Revoke sequences' isOpen={isOpen} onClose={onClose}>
            {accessToken === undefined ? (
                <p>You need to be logged in to revoke sequences.</p>
            ) : (
                <div className='space-y-4'>
                    <ActiveFilters sequenceFilter={sequenceFilter} />
                    <p className='font-semibold'>
                        Are you sure you want to create revocation entries for the following {totalCount} sequence
                        {totalCount > 1 ? 's' : ''}?
                    </p>
                    <div className='bg-yellow-50 border-l-4 border-yellow-400 p-4'>
                        <div className='flex'>
                            <div className='flex-shrink-0'>
                                <WarningAmberIcon className='h-5 w-5 text-yellow-400' aria-hidden='true' />
                            </div>
                            <div className='ml-3'>
                                <p className='text-sm text-yellow-700'>
                                    <strong>Warning:</strong> Revocation will suppress these sequences by default in
                                    searches and mark all previous entries as having been revoked. This action creates
                                    new revocation entries in the database.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className='mt-4'>
                        <label htmlFor='revoke-reason' className='block text-sm font-medium text-gray-700 mb-2'>
                            Reason for revocation (optional)
                        </label>
                        <input
                            id='revoke-reason'
                            type='text'
                            value={versionComment}
                            onChange={(e) => setVersionComment(e.target.value)}
                            placeholder='Enter reason for revocation'
                            className='w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500'
                        />
                    </div>
                    <div className='flex flex-row gap-2 justify-end mt-6'>
                        <Button className='btn' onClick={onClose}>
                            Cancel
                        </Button>
                        <Button className='btn bg-red-600 text-white hover:bg-red-700' onClick={handleRevoke}>
                            Revoke {totalCount} sequence{totalCount > 1 ? 's' : ''}
                        </Button>
                    </div>
                </div>
            )}
        </BaseDialog>
    );
};
