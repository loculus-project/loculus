import React from 'react';

interface BannerProps {
    message?: string;
}

export const Banner: React.FC<BannerProps> = ({ message }) => {
    if (message === undefined) {
        return null;
    }

    return (
        <div className=' bg-gray-100 border-b border-gray-400 text-gray-700 px-4 py-1   opacity-50'>
            <p
                style={{
                    fontSize: '.7rem',
                }}
            >
                {message}
            </p>
        </div>
    );
};
