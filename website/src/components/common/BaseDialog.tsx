import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import React, { type ReactNode } from 'react';

import { Button } from './Button';

/**
 * `BaseDialog` is the single modal component used across the website.
 *
 * By default it is easily dismissed: clicking the backdrop or pressing Escape
 * closes it (via Headless UI's `Dialog` `onClose`). Use that for lightweight,
 * informational modals where accidentally closing the dialog is harmless (e.g.
 * showing details or citations).
 *
 * Pass `dismissible={false}` for confirmation dialogs and involved modals (e.g.
 * forms) where the user might lose significant state to an accidental backdrop
 * click. The dialog then only closes via the close button or an explicit action.
 */
interface BaseDialogProps {
    title: string;
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    fullWidth?: boolean;
    className?: string;
    /** When false, backdrop clicks and Escape do not close the dialog. Defaults to true. */
    dismissible?: boolean;
}

export const BaseDialog: React.FC<BaseDialogProps> = ({
    title,
    isOpen,
    onClose,
    children,
    fullWidth = true,
    className,
    dismissible = true,
}) => {
    const fullWidthClasses = fullWidth ? 'w-full' : '';
    return (
        <Dialog open={isOpen} onClose={dismissible ? onClose : () => {}} className='relative z-40'>
            <div className='fixed inset-0 bg-black/25' />
            <div className='fixed inset-0 overflow-y-auto'>
                <div className='flex min-h-full items-center justify-center p-4 text-center'>
                    <DialogPanel
                        className={`${fullWidthClasses} relative transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl ${className ?? ''}`}
                    >
                        <DialogTitle as='h3' className='text-2xl font-bold leading-6 text-gray-900 mb-4'>
                            {title}
                        </DialogTitle>
                        <CloseButton onClick={onClose} />
                        {children}
                    </DialogPanel>
                </div>
            </div>
        </Dialog>
    );
};

interface CloseButtonProps {
    onClick: () => void;
}

const CloseButton: React.FC<CloseButtonProps> = ({ onClick }) => {
    return (
        <Button className='absolute right-2 top-2 text-gray-400 hover:text-gray-500' onClick={onClick}>
            <span className='sr-only'>Close</span>
            <svg className='h-6 w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
            </svg>
        </Button>
    );
};
