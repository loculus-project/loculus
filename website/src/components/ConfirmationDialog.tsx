import { type ReactNode, useSyncExternalStore } from 'react';

import { BaseDialog } from './common/BaseDialog';
import { Button } from './common/Button';

export type ConfirmOptions = {
    dialogText: ReactNode;
    confirmButtonText?: string;
    closeButtonText?: string;
    onConfirmation: () => Promise<void> | void;
};

/*
 * Global confirmation dialog, driven by a module-level store and rendered by a
 * single host (`ConfirmDialogContainer`) at the app root — call
 * `displayConfirmation({...})` from anywhere. A store rather than React context
 * is required because each Astro `client:*` island is an isolated React tree
 * that context cannot cross.
 * The host renders in-tree (not a detached `createRoot`), so Headless UI keeps
 * the background inert.
 */

let currentOptions: ConfirmOptions | null = null;
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) {
        listener();
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        // No host mounted means there can be no pending confirmation. (In the app
        // the single host lives for the whole session, so this never fires there;
        // it keeps state from leaking between tests that remount the host.)
        if (listeners.size === 0) {
            currentOptions = null;
        }
    };
}

function getSnapshot() {
    return currentOptions;
}

export function displayConfirmation(options: ConfirmOptions) {
    currentOptions = options;
    emit();
}

function close() {
    currentOptions = null;
    emit();
}

/** Mount exactly once at the app root. */
export function ConfirmDialogContainer() {
    const options = useSyncExternalStore(subscribe, getSnapshot, () => null);

    return (
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
}
