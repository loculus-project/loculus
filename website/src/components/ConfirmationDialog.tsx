import { type ReactNode, useCallback, useState } from 'react';

import { BaseDialog } from './common/BaseDialog';
import { Button } from './common/Button';

type ConfirmOptions = {
    dialogText: ReactNode;
    confirmButtonText?: string;
    closeButtonText?: string;
    onConfirmation: () => Promise<void> | void;
};

/**
 * Declarative confirmation dialog built on {@link BaseDialog}.
 *
 * Render `confirmDialog` once in your component and call `confirm({...})` (e.g.
 * from an `onClick`) to open it. Only one confirmation can be shown at a time,
 * so a single hook instance covers any number of confirm actions in a component.
 *
 * The dialog is not dismissible by backdrop click (it is a confirmation); the
 * user must pick an action or use the close button.
 */
export function useConfirmDialog() {
    const [options, setOptions] = useState<ConfirmOptions | null>(null);

    const confirm = useCallback((newOptions: ConfirmOptions) => setOptions(newOptions), []);
    const close = useCallback(() => setOptions(null), []);

    const confirmDialog = (
        <BaseDialog title='' isOpen={options !== null} onClose={close} fullWidth={false} dismissible={false}>
            {options !== null && (
                <>
                    <h3 className='font-bold text-lg pr-8'>{options.dialogText}</h3>
                    <div className='flex justify-end gap-4 mt-4'>
                        <Button variant='primary' onClick={close}>
                            {options.closeButtonText ?? 'Cancel'}
                        </Button>
                        <Button
                            variant='primary'
                            onClick={() =>
                                void (async () => {
                                    await options.onConfirmation();
                                    close();
                                })()
                            }
                        >
                            {options.confirmButtonText ?? 'Confirm'}
                        </Button>
                    </div>
                </>
            )}
        </BaseDialog>
    );

    return { confirm, confirmDialog };
}
