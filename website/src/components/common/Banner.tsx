import React from 'react';

interface BannerProps {
    message?: string;
}

export const Banner: React.FC<BannerProps> = ({ message }) => {
    if (message === undefined) {
        return null;
    }

    return (
        <div className='absolute top-0 right-0 m-1 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-1.5 rounded-md  opacity-70'>
            <p className='text-sm font-medium'>{message}</p>
        </div>
    );
};
