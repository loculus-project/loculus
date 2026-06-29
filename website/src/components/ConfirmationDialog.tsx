import { type FC, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { BaseDialog } from './common/BaseDialog';
import { Button } from './common/Button';

type ConfirmationDialogProps = {
    dialogText: ReactNode;
    confirmButtonText: string;
    closeButtonText: string;
    onConfirmation: () => Promise<void> | void;
    onClose: () => void;
};

type DisplayConfirmationProps = {
    dialogText: ReactNode;
    confirmButtonText?: string;
    closeButtonText?: string;
    onConfirmation: () => Promise<void> | void;
};

const ConfirmationDialog: FC<ConfirmationDialogProps> = ({
    dialogText,
    onConfirmation,
    onClose,
    confirmButtonText,
    closeButtonText,
}) => {
    return (
        <BaseDialog title='' isOpen={true} onClose={onClose} fullWidth={false} dismissible={false}>
            <h3 className='font-bold text-lg pr-8'>{dialogText}</h3>
            <div className='flex justify-end gap-4 mt-4'>
                <Button variant='primary' onClick={onClose}>
                    {closeButtonText}
                </Button>
                <Button
                    variant='primary'
                    onClick={() =>
                        void (async () => {
                            await onConfirmation();
                            onClose();
                        })()
                    }
                >
                    {confirmButtonText}
                </Button>
            </div>
        </BaseDialog>
    );
};

/**
 * Imperatively show a confirmation dialog built on {@link BaseDialog}.
 *
 * Call it from an event handler (e.g. `onClick`); there is nothing to render in
 * the component tree. The dialog is mounted in a transient React root that is
 * torn down once an action is taken or it is closed. It is not dismissible by
 * backdrop click (it is a confirmation); the user must pick an action or use the
 * close button.
 */
export const displayConfirmationDialog = ({
    dialogText,
    onConfirmation,
    confirmButtonText = 'Confirm',
    closeButtonText = 'Cancel',
}: DisplayConfirmationProps) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const close = () => {
        root.unmount();
        container.remove();
    };

    root.render(
        <ConfirmationDialog
            dialogText={dialogText}
            confirmButtonText={confirmButtonText}
            closeButtonText={closeButtonText}
            onConfirmation={onConfirmation}
            onClose={close}
        />,
    );
};
