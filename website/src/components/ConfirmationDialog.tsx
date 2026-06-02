import { type FC } from 'react';
import { confirmAlert } from 'react-confirm-alert';

import { Button } from '../components/common/Button';

type ConfirmationDialogProps = {
    dialogText: string;
    confirmButtonText?: string;
    closeButtonText?: string;
    onConfirmation: () => Promise<void> | void;
    onClose: () => void;
};

type DisplayConfirmationProps = {
    dialogText: string;
    confirmButtonText?: string;
    closeButtonText?: string;
    onConfirmation: () => Promise<void> | void;
};

export const ConfirmationDialog: FC<ConfirmationDialogProps> = ({
    dialogText,
    onConfirmation,
    onClose,
    confirmButtonText = 'Confirm',
    closeButtonText = 'Cancel',
}) => {
    return (
        <div className='modal-box'>
            <form method='dialog'>
                <Button circle size='sm' variant='ghost' className='absolute right-2 top-2' onClick={onClose}>
                    ✕
                </Button>
            </form>
            <h3 className='font-bold text-lg'>{dialogText}</h3>
            <div className='flex justify-end gap-4 mt-4'>
                <form method='dialog'>
                    <Button variant='primary' onClick={onClose}>
                        {closeButtonText}
                    </Button>
                </form>
                <form method='dialog'>
                    <Button variant='primary' onClick={() => void onConfirmation()}>
                        {confirmButtonText}
                    </Button>
                </form>
            </div>
        </div>
    );
};

export const displayConfirmationDialog = ({
    dialogText,
    onConfirmation,
    confirmButtonText = 'Confirm',
    closeButtonText = 'Cancel',
}: DisplayConfirmationProps) => {
    confirmAlert({
        closeOnClickOutside: true,
        // Make the overlay an open daisyUI modal so the `.modal-box` child is visible.
        overlayClassName: 'modal modal-open',

        customUI: ({ onClose }) => (
            <ConfirmationDialog
                dialogText={dialogText}
                confirmButtonText={confirmButtonText}
                closeButtonText={closeButtonText}
                onConfirmation={async () => {
                    await onConfirmation();
                    onClose();
                }}
                onClose={onClose}
            />
        ),
    });
};
