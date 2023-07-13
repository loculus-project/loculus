import type { FC } from 'react';

// Note: Props are not really necessary here, but astro has issues with
//  react components without props and client:... directive
type BackButtonProps = {
    marginRight: number;
};
export const BackButton: FC<BackButtonProps> = ({ marginRight }) => {
    const goBack = () => {
        window.history.back();
    };

    return (
        <button onClick={goBack} className={`mr-${marginRight}`}>
            <svg
                viewBox='0 0 24 24'
                fill='none'
                stroke='#54858c'
                strokeWidth='4'
                strokeLinecap='round'
                strokeLinejoin='round'
                style={{ width: '1.5rem', height: '1.5rem' }}
            >
                <polyline points='15 17 9 11 15 5' />
            </svg>
        </button>
    );
};
