import { type FC } from 'react';
import { confirmAlert } from 'react-confirm-alert';

type ConfirmationDialogProps = {
    dialogText: string;
    onConfirmation: () => void;
    onClose: () => void;
};

type DisplayConfirmationProps = {
    dialogText: string;
    onConfirmation: () => Promise<void>;
};

export const ConfirmationDialog: FC<ConfirmationDialogProps> = ({ dialogText, onConfirmation, onClose }) => {
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
                    <button className='btn btn-error' onClick={onClose}>
                        Cancel
                    </button>
                </form>
                <form method='dialog'>
                    <button className='btn loculusColor' onClick={onConfirmation}>
                        Confirm
                    </button>
                </form>
            </div>
        </div>
    );
};

export const displayConfirmationDialog = ({ dialogText, onConfirmation }: DisplayConfirmationProps) => {
    confirmAlert({
        closeOnClickOutside: true,

        customUI: ({ onClose }) => (
            <ConfirmationDialog
                dialogText={dialogText}
                onConfirmation={async () => {
                    await onConfirmation();
                    onClose();
                }}
                onClose={onClose}
            />
        ),
    });
};
