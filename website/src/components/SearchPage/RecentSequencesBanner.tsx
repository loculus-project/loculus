import { type FC, useEffect, useState } from 'react';

export const getLastApprovalTimeKey = (organism: string) => organism + 'lastApprovalTime';
import MdiClockOutline from '~icons/mdi/clock-outline';
interface RecentSequencesBannerProps {
    organism: string;
}

export const RecentSequencesBanner: FC<RecentSequencesBannerProps> = ({ organism }) => {
    const [showBanner, setShowBanner] = useState(false);

    useEffect(() => {
        const checkApprovalTime = () => {
            const lastApproveTimeString = localStorage.getItem(getLastApprovalTimeKey(organism));
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
    }, [organism]);
    if (!showBanner) {
        return null;
    }
    return (
        <div className='bg-green-100 text-center p-4 text-green-800  rounded border-green-600 border mb-4 opacity-70'>
            <MdiClockOutline className='inline-block mr-2' />
            You recently approved new sequences for release. Sequences take time to load into the database and so it may
            be several minutes before they appear here.
        </div>
    );
};
