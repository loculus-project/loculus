import { useCallback, useState } from 'react';

export const useOffCanvas = (initialIsOpen = false) => {
    const [isOpen, setOpen] = useState(initialIsOpen);

    const open = useCallback(() => {
        document.body.style.overflow = 'hidden'; // This makes the background not scrollable
        setOpen(true);
    }, [setOpen]);

    const close = useCallback(() => {
        document.body.style.overflow = 'unset';
        setOpen(false);
    }, [setOpen]);

    const toggle = useCallback(() => {
        if (isOpen) {
            close();
        } else {
            open();
        }
    }, [isOpen, open, close]);

    return { isOpen, open, close, toggle };
};
