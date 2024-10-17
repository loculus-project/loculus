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
                    className='dropdown-content z-[1] menu p-1 shadow bg-base-100 rounded-box absolute top-full left-0 text-sm'
                >
                    {sequenceEntryHistory.map((version) => (
                        <li key={version.accessionVersion}>
                            <a
                                href={routes.sequenceEntryDetailsPage(version.accessionVersion)}
                                onClick={(e) => {
                                    if (setPreviewedSeqId) {
                                        setPreviewedSeqId(version.accessionVersion);
                                        e.preventDefault();
                                    }
                                }}
                            >
                                {version.accessionVersion}
                                <p className={`font-bold ${getVersionStatusColor(version.versionStatus)}`}>
                                    ({sentenceCase(version.versionStatus)})
                                </p>
                            </a>
                        </li>
                    ))}
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
