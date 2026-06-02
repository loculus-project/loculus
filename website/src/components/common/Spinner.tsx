import type { FC } from 'react';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';

const sizePx: Record<SpinnerSize, number> = {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 28,
};

interface SpinnerProps {
    size?: SpinnerSize;
    className?: string;
    label?: string;
}

export const Spinner: FC<SpinnerProps> = ({ size = 'md', className = '', label }) => {
    const px = sizePx[size];
    return (
        <svg
            className={`animate-spin inline-block shrink-0 ${className}`}
            width={px}
            height={px}
            viewBox='0 0 24 24'
            fill='none'
            role={label !== undefined ? 'status' : undefined}
            aria-label={label}
            aria-hidden={label === undefined ? true : undefined}
        >
            <circle cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='3' className='opacity-25' />
            <path d='M12 2a10 10 0 0 1 10 10' stroke='currentColor' strokeWidth='3' strokeLinecap='round' />
        </svg>
    );
};
