import type { FC } from 'react';

export const BackButton: FC<void> = () => {
    const goBack = () => {
        window.history.back();
    };

    return (
        <button onClick={goBack}>
            <svg
                xmlns='http://www.w3.org/2000/svg'
                viewBox='0 0 24 24'
                fill='none'
                stroke='#54858c'
                strokeWidth='4'
                strokeLinecap='round'
                strokeLinejoin='round'
                className='feather feather-arrow-left'
                style={{ width: '1.5rem', height: '1.5rem' }}
            >
                <polyline points='15 17 9 11 15 5' />
            </svg>
        </button>
    );
};
