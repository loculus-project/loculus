import React from 'react';

interface BannerProps {
    message?: string;
    lastTimeBannerWasClosed: number | undefined;
    serverTime: number;
}

export const Banner: React.FC<BannerProps> = ({ message, lastTimeBannerWasClosed, serverTime }) => {
    const timeToKeepBannerClosed = 1000 * 60 * 60 * 24 * 365;

    if (
        message === undefined ||
        (lastTimeBannerWasClosed !== undefined && lastTimeBannerWasClosed + timeToKeepBannerClosed > serverTime)
    ) {
        return null;
    }
    const initialClientTime = Date.now();
    const serverClientOffset = serverTime - initialClientTime;

    const setBannerClosed = () => {
        document.cookie = `lastTimeBannerWasClosed=${Date.now() + serverClientOffset}; max-age=${60 * 60 * 24 * 365}`;
        window.location.reload();
    };

    return (
        <div className=' bg-yellow-100 border-b border-gray-400 text-yellow-700 px-4 py-1 opacity-90 flex justify-between'>
            {message}

            <button
                onClick={setBannerClosed}
                className='text-yellow-700'
                style={{
                    fontSize: '.7rem',
                }}
            >
                X
            </button>
        </div>
    );
};
