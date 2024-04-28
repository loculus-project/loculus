import React, { useEffect, useState } from 'react';

export const RecentSequencesBanner: React.FC = () => {
    const [showBanner, setShowBanner] = useState(false);

    useEffect(() => {
        const checkApprovalTime = () => {
            const lastApproveTimeString = localStorage.getItem('lastApprovalTime');
            if (lastApproveTimeString === null) {
                setShowBanner(false);
                return;
            }
            const lastApprovalTime = parseInt(lastApproveTimeString, 10);
            const currentTime = Math.floor(Date.now() / 1000);
            const tenMinutes = 10 * 60; // 10 minutes in seconds
            setShowBanner(currentTime - lastApprovalTime <= tenMinutes);
        };

        // Run the check on component mount and every 10 seconds
        checkApprovalTime();
        const intervalId = setInterval(checkApprovalTime, 10000);

        // Clear the interval on component unmount
        return () => clearInterval(intervalId);
    }, []);
    if (!showBanner) {
        return null;
    }
    return (
        <div className='bg-yellow-100 text-center p-4 text-yellow-800  rounded border-yellow-600 border mb-4 opacity-70'>
            You have recently approved sequences, these must be loaded into the dataset and so may take several minutes
            to appear here.
        </div>
    );
};
