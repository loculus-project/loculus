import { type FC } from 'react';
import { confirmAlert } from 'react-confirm-alert';

import { Button } from '../components/common/Button';
import { ModalBox } from '../components/common/ModalBox';

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
        <ModalBox>
            <form method='dialog'>
                <Button circle size='sm' variant='ghost' className='absolute right-2 top-2' onClick={onClose}>
                    ✕
                </Button>
            </form>
            <h3 className='font-bold text-lg pr-8'>{dialogText}</h3>
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
        </ModalBox>
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
