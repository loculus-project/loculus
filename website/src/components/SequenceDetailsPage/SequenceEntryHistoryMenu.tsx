import React from 'react';

import { routes } from '../../routes/routes';
import { type SequenceEntryHistory } from '../../types/lapis';
import { getVersionStatusColor, getVersionStatusLabel } from '../../utils/getVersionStatusColor';
import { buttonClasses } from '../common/buttonStyles';
import { DropdownMenu, DropdownMenuItem } from '../common/DropdownMenu';
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
            <DropdownMenu
                className='hidden sm:inline-block mr-2'
                panelClassName='top-full -right-32 text-sm w-80'
                trigger={
                    <label
                        tabIndex={0}
                        className={buttonClasses({ size: 'sm', variant: 'outline', className: 'py-1' })}
                    >
                        <span className='text-sm'>
                            {selectedVersion === undefined ? 'All versions' : `Version ${selectedVersion.version}`}
                        </span>
                        <Arrow />
                    </label>
                }
            >
                {sequenceEntryHistory.map((version) => {
                    const isSelected = accessionVersion === version.accessionVersion;
                    return (
                        <DropdownMenuItem
                            key={version.accessionVersion}
                            href={routes.sequenceEntryDetailsPage(version.accessionVersion)}
                            onClick={(e) => {
                                if (setPreviewedSeqId) {
                                    setPreviewedSeqId(version.accessionVersion);
                                    e.preventDefault();
                                }
                            }}
                        >
                            <span className={isSelected ? 'font-semibold' : ''}>{version.accessionVersion}</span>
                            <p className={`${getVersionStatusColor(version.versionStatus, version.isRevocation)} ml-2`}>
                                {getVersionStatusLabel(version.versionStatus, version.isRevocation)}
                            </p>
                        </DropdownMenuItem>
                    );
                })}
                <DropdownMenuItem
                    href={routes.sequenceEntryVersionsPage(accessionVersion)}
                    className='border-t border-base-300 mt-1 pt-2 rounded-none'
                >
                    All versions
                </DropdownMenuItem>
            </DropdownMenu>
            <div className='sm:hidden inline-block mr-2'>
                <a href={routes.sequenceEntryVersionsPage(accessionVersion)} className='text-xl'>
                    <IcBaselineHistory />
                </a>
            </div>
        </>
    );
};
