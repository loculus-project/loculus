import { type FC, type ReactNode } from 'react';

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
