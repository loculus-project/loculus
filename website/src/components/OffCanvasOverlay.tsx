import type { FC } from 'react';

type Props = {
    onClick?: () => void;
    className?: string;
};

export const OffCanvasOverlay: FC<Props> = ({ onClick, className }) => (
    <div className={`bg-gray-800 bg-opacity-50 fixed inset-0 z-30 ${className ?? ''}`} onClick={onClick} />
);
