import type { FC } from 'react';

import { getLatestAccessionVersion } from './getTableData';
import { routes } from '../../routes/routes.ts';
import { versionStatuses, type SequenceEntryHistory } from '../../types/lapis';
import { getAccessionVersionString } from '../../utils/extractAccessionVersion';

type SequencesBannerProps = {
    sequenceEntryHistory: SequenceEntryHistory;
    accessionVersion: string;
};

const SequencesBanner: FC<SequencesBannerProps> = ({ sequenceEntryHistory, accessionVersion }) => {
    const ownHistoryEntry = sequenceEntryHistory.find((entry) => entry.accessionVersion === accessionVersion);

    const latestAccessionVersion = getLatestAccessionVersion(sequenceEntryHistory);

    const revoked =
        ownHistoryEntry?.versionStatus === versionStatuses.revoked && latestAccessionVersion?.isRevocation === true;
    const isLatestVersion = ownHistoryEntry?.versionStatus === versionStatuses.latestVersion;

    return (
        <div className='py-3'>
            {!isLatestVersion && (
                <div className='bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-3' role='alert'>
                    <p className='font-bold'>This is not the latest version of this sequence entry.</p>
                    {latestAccessionVersion && (
                        <p>
                            The latest version is:
                            <a
                                href={routes.sequenceEntryDetailsPage(latestAccessionVersion)}
                                className='font-bold underline mx-1'
                            >
                                {getAccessionVersionString(latestAccessionVersion)}
                            </a>
                        </p>
                    )}
                </div>
            )}
            {ownHistoryEntry?.isRevocation && (
                <div className='bg-red-100 border-l-4 border-red-500 text-red-700 p-3' role='alert'>
                    <p className='font-bold'>
                        This is a revocation version. It essentially contains no data, it's just a marker that all
                        previous versions have been revoked.
                    </p>
                </div>
            )}
            {revoked && (
                <>
                    <div className='bg-red-100 border-l-4 border-red-500 text-red-700 p-3' role='alert'>
                        <p className='font-bold'>This sequence entry has been revoked!</p>
                    </div>
                    <div className='fixed top-0 left-0 w-full h-full flex items-center justify-center pointer-events-none'>
                        <div className='text-red-600 rotate-45 text-8xl font-bold uppercase opacity-20'>REVOKED</div>
                    </div>
                </>
            )}
        </div>
    );
};

export default SequencesBanner;
