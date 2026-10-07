import { type FC, type MouseEvent, useState } from 'react';

import { BaseDialog } from './BaseDialog';
import { Button } from './Button';
import { routes } from '../../routes/routes';

type RestrictedUseDownloadDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

export const RestrictedUseDownloadDialog: FC<RestrictedUseDownloadDialogProps> = ({ isOpen, onClose, onConfirm }) => (
    <BaseDialog
        title='Restricted-Use sequence'
        isOpen={isOpen}
        onClose={onClose}
        fullWidth={false}
        className='max-w-lg'
    >
        <p className='text-gray-700 pr-6'>
            This sequence is only available under the Restricted Use Terms. By downloading it, you agree to follow the{' '}
            <a href={routes.datauseTermsPage()} target='_blank' className='underline'>
                Restricted Use Terms
            </a>
            .
        </p>
        <div className='flex justify-end gap-4 mt-6'>
            <Button variant='outline' onClick={onClose}>
                Cancel
            </Button>
            <Button variant='primary' onClick={onConfirm} data-testid='confirm-restricted-download'>
                I agree, download
            </Button>
        </div>
    </BaseDialog>
);

/**
 * Asks the user to agree to the Restricted Use Terms before a download of restricted data goes ahead.
 * Unrestricted downloads go ahead immediately. Render `confirmationDialog` somewhere in the component tree.
 */
export const useRestrictedUseDownloadConfirmation = (isRestricted: boolean) => {
    const [pendingDownload, setPendingDownload] = useState<(() => void) | null>(null);

    const requestDownload = (download: () => void) => {
        if (isRestricted) {
            setPendingDownload(() => download);
        } else {
            download();
        }
    };

    const onDownloadLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (!isRestricted) {
            return;
        }
        event.preventDefault();
        const href = event.currentTarget.href;
        setPendingDownload(() => () => window.location.assign(href));
    };

    const confirmationDialog = (
        <RestrictedUseDownloadDialog
            isOpen={pendingDownload !== null}
            onClose={() => setPendingDownload(null)}
            onConfirm={() => {
                pendingDownload?.();
                setPendingDownload(null);
            }}
        />
    );

    return { requestDownload, onDownloadLinkClick, confirmationDialog };
};
