import React from 'react';

import { routes } from '../../routes/routes';
import { type SequenceEntryHistory } from '../../types/lapis';
import { getVersionStatusColor, getVersionStatusLabel } from '../../utils/getVersionStatusColor';
import IcBaselineHistory from '~icons/ic/baseline-history';
import Arrow from '~icons/ic/sharp-keyboard-arrow-down';

interface Props {
    sequenceEntryHistory: SequenceEntryHistory;
    accessionVersion: string;
    setPreviewedSeqId?: (seqId: string | null) => void;
}

export const SequenceEntryHistoryMenu: React.FC<Props> = ({
    sequenceEntryHistory,
    accessionVersion,
    setPreviewedSeqId,
}) => {
    const selectedVersion = sequenceEntryHistory.find((version) => version.accessionVersion === accessionVersion);
    return (
        <>
            <div className='dropdown dropdown-hover hidden sm:inline-block mr-2'>
                <label tabIndex={0} className='btn btn-sm btn-outline py-1'>
                    <span className='text-sm'>
                        {selectedVersion === undefined ? 'All versions' : `Version ${selectedVersion.version}`}
                    </span>
                    <Arrow />
                </label>
                <ul
                    tabIndex={0}
                    className='dropdown-content z-[1] menu p-1 shadow bg-base-100 rounded-box absolute top-full right-[-8rem] text-sm w-80'
                >
                    {sequenceEntryHistory.map((version) => {
                        const isSelected = accessionVersion === version.accessionVersion;
                        return (
                            <li key={version.accessionVersion}>
                                <a
                                    href={routes.sequenceEntryDetailsPage(version.accessionVersion)}
                                    className='hover:no-underline'
                                    onClick={(e) => {
                                        if (setPreviewedSeqId) {
                                            setPreviewedSeqId(version.accessionVersion);
                                            e.preventDefault();
                                        }
                                    }}
                                >
                                    <span className={isSelected ? 'font-semibold' : ''}>
                                        {version.accessionVersion}
                                    </span>
                                    <p
                                        className={`${getVersionStatusColor(version.versionStatus, version.isRevocation)} ml-2`}
                                    >
                                        {getVersionStatusLabel(version.versionStatus, version.isRevocation)}
                                    </p>
                                </a>
                            </li>
                        );
                    })}
                    <li className='border-t mt-1 pt-1'>
                        <a href={routes.sequenceEntryVersionsPage(accessionVersion)} className='hover:no-underline'>
                            All versions
                        </a>
                    </li>
                </ul>
            </div>
            <div className='sm:hidden inline-block mr-2'>
                <a href={routes.sequenceEntryVersionsPage(accessionVersion)} className='text-xl'>
                    <IcBaselineHistory />
                </a>
            </div>
        </>
    );
};
