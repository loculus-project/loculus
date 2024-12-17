import { useCallback, useEffect, useState } from 'react';

export const useOffCanvas = (initialIsOpen = false) => {
    const [isOpen, setOpen] = useState(initialIsOpen);

    const open = useCallback(() => {
        setOpen(true);
    }, [setOpen]);

    const close = useCallback(() => {
        setOpen(false);
    }, [setOpen]);

    useEffect(() => {
        document.body.style.overflow = isOpen ? 'hidden' : 'unset'; // 'hidden' makes the background not scrollable
    }, [isOpen]);

    const toggle = useCallback(() => {
        if (isOpen) {
            close();
        } else {
            open();
        }
    }, [isOpen, open, close]);

    return { isOpen, open, close, toggle };
};
