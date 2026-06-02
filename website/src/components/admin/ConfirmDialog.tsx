import { type ReactNode } from 'react';

import { BaseDialog } from '../common/BaseDialog';
import { Button } from '../common/Button';

interface Props {
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    busy = false,
    onConfirm,
    onCancel,
}: Props) {
    return (
        <BaseDialog title={title} isOpen onClose={onCancel} fullWidth={false}>
            <div className='max-w-md space-y-4'>
                <div className='text-sm text-gray-700'>{message}</div>
                <div className='flex justify-end gap-2'>
                    <Button
                        type='button'
                        onClick={onCancel}
                        disabled={busy}
                        className='bg-white border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded text-sm'
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        type='button'
                        onClick={onConfirm}
                        disabled={busy}
                        className={`${destructive ? 'bg-red-700 hover:bg-red-800' : 'bg-primary-700 hover:bg-primary-800'} text-white px-3 py-1.5 rounded text-sm disabled:opacity-50`}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </BaseDialog>
    );
}
