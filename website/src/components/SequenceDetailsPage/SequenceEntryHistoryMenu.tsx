import { sentenceCase } from 'change-case';
import React from 'react';

import { routes } from '../../routes/routes';
import { type SequenceEntryHistory } from '../../types/lapis';
import { getVersionStatusColor } from '../../utils/getVersionStatusColor';
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
    return (
        <>
            <div className='dropdown dropdown-hover hidden sm:inline-block'>
                <label tabIndex={0} className='btn btn-sm btn-outline py-1'>
                    <a href={routes.versionPage(accessionVersion)} className='text-sm'>
                        All versions
                    </a>
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
                                    <p className={`${getVersionStatusColor(version.versionStatus)} ml-2`}>
                                        {sentenceCase(version.versionStatus)}
                                    </p>
                                </a>
                            </li>
                        );
                    })}
                </ul>
            </div>
            <div className='sm:hidden inline-block'>
                <a href={routes.versionPage(accessionVersion)} className='text-xl'>
                    <IcBaselineHistory />
                </a>
            </div>
        </>
    );
};
