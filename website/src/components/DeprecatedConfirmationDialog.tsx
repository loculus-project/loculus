import { type FC } from 'react';

type ConfirmationDialogProps = {
    dialogText: string;
    onConfirmation: () => void;
};

export const ConfirmationDialog: FC<ConfirmationDialogProps> = ({ dialogText, onConfirmation }) => {
    return (
        <div className='modal-box'>
            <form method='dialog'>
                <button className='btn btn-sm btn-circle btn-ghost absolute right-2 top-2'>✕</button>
            </form>

            <h3 className='font-bold text-lg'>{dialogText}</h3>

            <div className='flex justify-end gap-4 mt-4'>
                <form method='dialog'>
                    <button className='btn btn-error'>Cancel</button>
                </form>
                <form method='dialog'>
                    <button className='btn loculusGreen' onClick={onConfirmation}>
                        Confirm
                    </button>
                </form>
            </div>
        </div>
    );
};
