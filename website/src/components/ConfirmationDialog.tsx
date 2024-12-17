import { type FC } from 'react';
import { confirmAlert } from 'react-confirm-alert';

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
                <button className='btn btn-sm btn-circle btn-ghost absolute right-2 top-2' onClick={onClose}>
                    ✕
                </button>
            </form>

            <h3 className='font-bold text-lg'>{dialogText}</h3>

            <div className='flex justify-end gap-4 mt-4'>
                <form method='dialog'>
                    <button className='btn loculusColor text-white hover:bg-primary-700' onClick={onClose}>
                        {closeButtonText}
                    </button>
                </form>
                <form method='dialog'>
                    <button
                        className='btn loculusColor text-white hover:bg-primary-700'
                        onClick={() => void onConfirmation()}
                    >
                        {confirmButtonText}
                    </button>
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
