import { useEffect } from 'react';

/**
 * Warns the user with a native "leave site?" dialog if they try to navigate
 * away (close tab, back/forward, refresh) while `dirty` is true.
 *
 * Modern browsers ignore custom messages — they show their own — but they do
 * honour the cancellation. That's enough to prevent accidental loss of edits
 * in the admin forms.
 */
export function useUnsavedGuard(dirty: boolean): void {
    useEffect(() => {
        if (!dirty) return;
        const handler = (e: BeforeUnloadEvent) => {
            // Calling preventDefault triggers the browser's native "leave site?"
            // dialog. We deliberately do not set the legacy `returnValue`
            // property — modern browsers honour preventDefault on its own.
            e.preventDefault();
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [dirty]);
}
