import React from 'react';

import { Button } from './Button';

interface BannerProps {
    message?: string;
    lastTimeBannerWasClosed: number | undefined;
    serverTime: number;
    cookieName?: string;
}

export const Banner: React.FC<BannerProps> = ({
    message,
    lastTimeBannerWasClosed,
    serverTime,
    cookieName = 'lastTimeBannerWasClosed',
}) => {
    const timeToKeepBannerClosed = 1000 * 60 * 60 * 24;
    if (
        message === undefined ||
        (lastTimeBannerWasClosed !== undefined && lastTimeBannerWasClosed + timeToKeepBannerClosed > serverTime)
    ) {
        return null;
    }

    const initialClientTime = Date.now();
    const serverClientOffset = serverTime - initialClientTime;

    const setBannerClosed = () => {
        document.cookie = `${cookieName}=${Date.now() + serverClientOffset}; max-age=${60 * 60 * 24 * 365}`;
        window.location.reload();
    };

    return (
        <div className='bg-yellow-100 border-b border-gray-400 text-yellow-700 px-4 py-2 opacity-90 flex justify-between'>
            {/* eslint-disable-next-line @typescript-eslint/naming-convention */}
            <div dangerouslySetInnerHTML={{ __html: message }} />
            <Button
                onClick={setBannerClosed}
                className='text-yellow-700'
                style={{
                    fontSize: '.7rem',
                }}
            >
                X
            </Button>
        </div>
    );
};
