import { type FC, type ReactNode } from 'react';

/*
 * The content box of a modal, replacing daisyUI's `modal-box`. Reproduces its
 * look as rendered on this instance: white, rounded, padded, drop-shadowed, up
 * to ~lg wide and scrollable when tall. The surrounding centering/backdrop is
 * provided by the modal container (a native <dialog> or the confirm-alert
 * overlay), as before.
 */
interface ModalBoxProps {
    className?: string;
    children: ReactNode;
}

export const ModalBox: FC<ModalBoxProps> = ({ className = '', children }) => (
    <div
        className={`relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-2xl ${className}`.trim()}
    >
        {children}
    </div>
);
