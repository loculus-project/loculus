import { useState } from 'react';

import { ConfirmDialog } from './ConfirmDialog';
import { AdminConfigClient, AdminConfigError } from '../../services/adminConfigClient';
import { Button } from '../common/Button';

interface Props {
    accessToken: string;
    backendUrl: string;
    organismKey: string;
}

export function MarkOrganismDeployedButton({ accessToken, backendUrl, organismKey }: Props) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const markDeployed = async () => {
        setError(null);
        setIsSubmitting(true);
        try {
            const client = new AdminConfigClient(accessToken, backendUrl);
            await client.markOrganismDeployed(organismKey);
            window.location.reload();
        } catch (e) {
            setError(
                AdminConfigError.isInstance(e)
                    ? (e.body.message ?? e.body.error)
                    : e instanceof Error
                      ? e.message
                      : String(e),
            );
            setConfirmOpen(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <span className='inline-flex flex-col gap-1'>
            <Button
                type='button'
                disabled={isSubmitting}
                onClick={() => setConfirmOpen(true)}
                className='text-amber-800 hover:underline disabled:text-gray-400 text-left'
            >
                {isSubmitting ? 'Marking deployed...' : 'Mark deployed'}
            </Button>
            {error !== null && <span className='text-xs text-red-600 max-w-xs'>{error}</span>}
            {confirmOpen && (
                <ConfirmDialog
                    title={`Mark ${organismKey} deployed`}
                    message={`Only mark ${organismKey} deployed after its SILO and LAPIS endpoints are healthy. Continue?`}
                    confirmLabel='Mark deployed'
                    busy={isSubmitting}
                    onConfirm={() => void markDeployed()}
                    onCancel={() => setConfirmOpen(false)}
                />
            )}
        </span>
    );
}
